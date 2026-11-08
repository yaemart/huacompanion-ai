import "dotenv/config";
import assert from "node:assert/strict";
import pg from "pg";
import { getPayload, type Payload } from "payload";
import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";
import type { PolicyFactDraft } from "../../payload-types";
import config from "../../src/payload.config";
import {
  mutateSharedPolicyFacts,
  readSharedPolicyFacts,
  type SharedFactInput,
} from "../../src/server/immigration/shared-facts-service";
import { refreshSharedNoteAssignees } from "../../src/server/immigration/shared-note-tasks";
import { up, down } from "../../src/migrations/20261108_160000_policy_note_tasks";
import { databaseFingerprints } from "../helpers/database-fingerprints";
import { relationID } from "../../src/cms/access";
import { policyFixture } from "../helpers/policy-workflow-fixture";
import { workflowAction, workflowRead, runWorkflowJobs } from "../../src/server/workflow/service";
const url = new URL(process.env.DATABASE_URL || "");
const clone = url.port === "55442" && /^\/hua_policy_c[23]_[a-f0-9]{32}$/.test(url.pathname);
const ci = process.env.CI === "true" && url.port === "55438" && url.pathname === "/hua_companion";
if (process.env.APP_ENV !== "local" || url.hostname !== "127.0.0.1" || (!clone && !ci))
  throw Error("Disposable fact-review clone or CI only");
const client = new pg.Client({ connectionString: url.toString() });
await client.connect();
try {
  const exists = (
    await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='workflow_tasks' AND column_name='policy_group_id'",
    )
  ).rowCount;
  const args = { db: { execute: (s: string) => client.query(s) } } as unknown as MigrateUpArgs;
  if (exists) await down(args as unknown as MigrateDownArgs);
  const before = await databaseFingerprints(client);
  await up(args);
  assert.deepEqual(await databaseFingerprints(client, before), before);
  await down(args as unknown as MigrateDownArgs);
  assert.deepEqual(await databaseFingerprints(client), before);
  await up(args);
  assert.deepEqual(await databaseFingerprints(client, before), before);
  console.log(`PASS task migration up/down/up preserves ${before.length} original tables`);
} finally {
  await client.end();
}
const p = await getPayload({ config });
try {
  await policyFixture(p, async ({ key, editor, reviewer, combined, outsider, admin }) => {
    const facts = {
      countryCode: "XY",
      countryNameEn: "Fictional",
      countryNameZh: "虚构国家",
      policyType: "unilateral",
      maximumStay: 30,
      stayUnit: "days",
      validFrom: "2026-01-01",
      validUntil: null,
      portsAndRegions: ["fictional"],
      officialSourceUrl: "https://example.invalid/policy",
      lastVerifiedOn: "2026-01-01",
      verifiedBy: editor.id,
      internalNotes: "private",
    };
    let d: PolicyFactDraft = await mutateSharedPolicyFacts(p, editor, {
      action: "save",
      contentKey: key,
      facts: { countryCode: "XY" },
    });
    const group = Number(relationID(d.group));
    const call = async (
      action: SharedFactInput["action"],
      extra: Partial<SharedFactInput> = {},
      actor = editor,
    ) => {
      d = await mutateSharedPolicyFacts(p, actor, {
        action,
        groupId: group,
        revision: d.revision,
        ...extra,
      });
      return d;
    };
    const refresh = async () => {
      const r = await readSharedPolicyFacts(p, editor, group);
      d = r.draft;
      return r;
    };
    const tasks = async () =>
      (
        await p.find({
          collection: "workflow-tasks",
          pagination: false,
          depth: 0,
          where: { policyGroup: { equals: group } },
          sort: "id",
        })
      ).docs;
    const mailBefore = (await p.count({ collection: "workflow-mail-jobs" })).totalDocs;
    const snap = async () => ({
      group: await p.findByID({ collection: "policy-groups", id: group, depth: 0 }),
      drafts: (
        await p.find({
          collection: "policy-note-drafts",
          where: { group: { equals: group } },
          depth: 0,
          pagination: false,
          sort: "id",
        })
      ).docs,
      facts: (
        await p.find({
          collection: "policy-fact-versions",
          where: { group: { equals: group } },
          depth: 0,
          pagination: false,
          sort: "id",
        })
      ).docs,
      tasks: await tasks(),
      audit: (
        await p.find({
          collection: "audit-events",
          where: {
            and: [{ entity: { equals: "policy-group" } }, { recordId: { equals: String(group) } }],
          },
          depth: 0,
          pagination: false,
          sort: "id",
        })
      ).docs,
    });
    await assert.rejects(() => call("submit"));
    await assert.rejects(() =>
      mutateSharedPolicyFacts(p, editor, { action: "save", contentKey: key, facts }),
    );
    await assert.rejects(() => call("save", { facts: { countryCode: "ZZ" } }));
    await assert.rejects(() => call("save", { facts: { publicNotes: "wrong object" } }));
    await assert.rejects(() => readSharedPolicyFacts(p, { ...outsider, role: "admin" }, group));
    await assert.rejects(() => call("save", {}, reviewer));
    await call("save", { facts });
    const stale = d.revision;
    await call("save", { facts: { maximumStay: 31 } }, combined);
    await assert.rejects(() => call("save", { revision: stale, facts: { maximumStay: 99 } }));
    await call("submit", {}, combined);
    await assert.rejects(() => call("save", { facts: { maximumStay: 40 } }));
    await assert.rejects(() => call("publish", { policyReviewed: true }, combined), /自己|例外/);
    await assert.rejects(() =>
      call("publish", { policyReviewed: true }, { ...editor, role: "admin" }),
    );
    await assert.rejects(() => call("return", { note: " " }, reviewer));
    await call("return", { note: "补充核实条件" }, reviewer);
    assert.equal(d.reviewNote, "补充核实条件");
    await call("save", { facts: { maximumStay: 30 } });
    await call("submit");
    await assert.rejects(() => call("publish", {}, reviewer), /核实/);
    await p.update({
      collection: "staff",
      id: reviewer.id,
      user: admin,
      data: { contentKinds: [] },
    });
    await assert.rejects(() => call("publish", { policyReviewed: true }, reviewer), /权限/);
    await p.update({
      collection: "staff",
      id: reviewer.id,
      user: admin,
      data: { contentKinds: ["immigration-policy"] },
    });
    await p.update({ collection: "staff", id: editor.id, user: admin, data: { active: false } });
    await assert.rejects(() => call("publish", { policyReviewed: true }, reviewer), /核实人/);
    await p.update({ collection: "staff", id: editor.id, user: admin, data: { active: true } });
    await assert.rejects(() => readSharedPolicyFacts(p, null, group), /账号/);
    const sourceRevision = d.revision;
    await call("publish", { policyReviewed: true }, reviewer);
    let current = await refresh();
    const v1 = Number(current.group.activeFactVersion);
    assert.equal(current.versions[0].revision, 1);
    assert.equal(current.versions[0].sourceRevision, sourceRevision);
    assert.equal((await tasks()).filter((t) => t.status === "open").length, 2);
    assert.equal((await tasks()).length, 2, "missing two language notes still produce two tasks");
    await assert.rejects(() => call("publish", { policyReviewed: true }, reviewer));
    assert.equal((await tasks()).length, 2);
    await assert.rejects(() =>
      p.update({ collection: "policy-fact-versions", id: v1, data: { revision: 99 } }),
    );
    console.log(
      "PASS draft allowlist, review freeze/return, stale revisions, fresh staff authority, participant self-review and formal immutable version",
    );
    const noteVersion = await p.create({
      collection: "policy-note-versions",
      data: {
        group,
        locale: "zh",
        revision: 1,
        title: "虚构中文",
        slug: key,
        publicNotes: "旧说明30天",
        basedOnFactVersion: v1,
        sourceRevision: 1,
        approvedBy: reviewer.id,
        contributors: [editor.id],
      },
    });
    for (const locale of ["zh", "en"] as const)
      await p.create({
        collection: "policy-note-drafts",
        data: {
          group,
          locale,
          revision: 1,
          title: "虚构说明",
          slug: key,
          publicNotes: locale === "zh" ? "旧说明30天" : "old note",
          basedOnFactVersion: v1,
          publishedNoteVersion: locale === "zh" ? noteVersion.id : null,
          needsReview: false,
          reviewState: locale === "zh" ? "approved" : "review",
          contributors: [editor.id],
          lastEditedBy: editor.id,
        },
      });
    const open = (await tasks()).find((t) => t.status === "open")!;
    const listed = await workflowRead(p, editor);
    assert.ok(listed.tasks.some((t) => t.id === open.id));
    assert.equal(
      (await workflowRead(p, outsider)).tasks.some((t) => t.id === open.id),
      false,
    );
    await p.update({
      collection: "staff",
      id: outsider.id,
      user: admin,
      data: { role: "manager", contentKinds: ["immigration-policy"] },
    });
    const manager = await p.findByID({ collection: "staff", id: outsider.id, depth: 0 });
    assert.equal(
      (await workflowRead(p, manager)).tasks.some((t) => t.id === open.id),
      false,
    );
    await assert.rejects(() => workflowAction(p, manager, { action: "claim", id: open.id }));
    await workflowAction(p, editor, { action: "claim", id: open.id });
    await assert.rejects(() => workflowAction(p, editor, { action: "done", id: open.id }), /审核/);
    await p.update({ collection: "staff", id: editor.id, user: admin, data: { active: false } });
    await refreshSharedNoteAssignees(p);
    assert.equal(
      (await p.findByID({ collection: "workflow-tasks", id: open.id, depth: 0 })).assignee,
      null,
    );
    await assert.rejects(() => readSharedPolicyFacts(p, editor, group));
    await p.update({ collection: "staff", id: editor.id, user: admin, data: { active: true } });
    await call("save", { facts: { maximumStay: 45 } });
    await call("submit");
    const original = p.create.bind(p);
    for (const failing of ["workflow-tasks", "audit-events"] as const) {
      const before = await snap();
      p.create = (async (args: Parameters<Payload["create"]>[0]) => {
        if (args.collection === failing) throw Error("C2_INJECTED_WRITE_FAILURE");
        return original(args);
      }) as typeof p.create;
      try {
        await assert.rejects(
          () => call("publish", { policyReviewed: true }, reviewer),
          /C2_INJECTED_WRITE_FAILURE/,
        );
      } finally {
        p.create = original;
      }
      assert.deepEqual(await snap(), before, "failed publish must roll back every side effect");
    }
    const input = {
      action: "publish" as const,
      groupId: group,
      revision: d.revision,
      policyReviewed: true,
    };
    const raced = await Promise.allSettled([
      mutateSharedPolicyFacts(p, reviewer, input),
      mutateSharedPolicyFacts(p, reviewer, input),
    ]);
    assert.equal(raced.filter((x) => x.status === "fulfilled").length, 1);
    current = await refresh();
    const v2 = Number(current.group.activeFactVersion);
    assert.notEqual(v2, v1);
    assert.equal(current.versions.length, 2);
    assert.equal(current.versions[0].revision, 2);
    const now = await snap();
    assert.equal(now.tasks.filter((t) => t.status === "open").length, 2);
    assert.equal(now.tasks.length, 4);
    for (const n of now.drafts) {
      assert.equal(n.needsReview, true);
      assert.equal(n.reviewState, "draft");
      assert.equal(n.basedOnFactVersion, v1);
      assert.equal(n.revision, 2);
    }
    assert.equal(now.drafts.find((n) => n.locale === "zh")?.publishedNoteVersion, noteVersion.id);
    assert.equal(
      (await p.findByID({ collection: "policy-note-versions", id: noteVersion.id })).publicNotes,
      "旧说明30天",
    );
    console.log(
      "PASS both-language invalidation and tasks, full rollback on task/audit failures, serial concurrent publish, old explanations unchanged",
    );
    // Even postponed policy tasks must never enter the generic mail queue.
    const t = (await tasks()).find((t) => t.status === "open")!;
    await p.update({
      collection: "workflow-tasks",
      id: t.id,
      data: { dueAt: "2020-01-01T00:00:00Z" },
    });
    await runWorkflowJobs(p);
    assert.equal((await p.count({ collection: "workflow-mail-jobs" })).totalDocs, mailBefore);
    const c = new pg.Client({ connectionString: url.toString() });
    await c.connect();
    try {
      await assert.rejects(
        () => down({ db: { execute: (s: string) => c.query(s) } } as unknown as MigrateDownArgs),
        /data|数据/i,
      );
    } finally {
      await c.end();
    }
    await call("restore", { versionId: v1 });
    assert.equal((d.facts as { maximumStay: number }).maximumStay, 30);
    assert.equal(Number((await refresh()).group.activeFactVersion), v2, "restore does not publish");
    await call("submit");
    await call("publish", { policyReviewed: true }, reviewer);
    assert.equal((await refresh()).versions[0].revision, 3);
    await call("unpublish", {}, reviewer);
    assert.equal((await refresh()).group.activeFactVersion, null);
    assert.equal((await tasks()).filter((t) => t.status === "open").length, 0);
    let a = await mutateSharedPolicyFacts(p, admin, {
      action: "save",
      contentKey: key + "-admin",
      facts: { ...facts, verifiedBy: admin.id },
    });
    const ga = Number(relationID(a.group));
    a = await mutateSharedPolicyFacts(p, admin, {
      action: "submit",
      groupId: ga,
      revision: a.revision,
    });
    await assert.rejects(
      () =>
        mutateSharedPolicyFacts(p, admin, {
          action: "publish",
          groupId: ga,
          revision: a.revision,
          policyReviewed: true,
        }),
      /例外|自己/,
    );
    a = await mutateSharedPolicyFacts(p, admin, {
      action: "publish",
      groupId: ga,
      revision: a.revision,
      policyReviewed: true,
      overrideReason: "隔离演示例外",
    });
    const ad = (
      await p.find({
        collection: "audit-events",
        where: {
          and: [
            { entity: { equals: "policy-group" } },
            { recordId: { equals: String(ga) } },
            { action: { equals: "publish" } },
          ],
        },
      })
    ).docs[0];
    assert.equal((ad.after as { overrideReason: string }).overrideReason, "隔离演示例外");
    const foreignVersion = Number(
      (await readSharedPolicyFacts(p, admin, ga)).group.activeFactVersion,
    );
    await assert.rejects(() => call("restore", { versionId: foreignVersion }));
    await mutateSharedPolicyFacts(p, admin, {
      action: "unpublish",
      groupId: ga,
      revision: a.revision,
      overrideReason: "隔离演示收尾",
    });
    console.log(
      "PASS scoped task permissions, invalid owner release, no manual review bypass/mail, protected rollback, restore/unpublish and audited admin exception",
    );
  });
} finally {
  await p.destroy();
}
process.exit(0);
