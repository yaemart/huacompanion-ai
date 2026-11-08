import "dotenv/config";
import assert from "node:assert/strict";
import { getPayload, type Payload } from "payload";
import type { PolicyNoteDraft } from "../../payload-types";
import config from "../../src/payload.config";
import {
  mutateSharedPolicyNote,
  readSharedPolicyNote,
  type SharedNoteInput,
} from "../../src/server/immigration/shared-notes-service";
import {
  mutateSharedPolicyFacts,
  readSharedPolicyFacts,
} from "../../src/server/immigration/shared-facts-service";
import { approvedSharedNote } from "../../src/lib/policy-shared-notes";
import { relationID } from "../../src/cms/access";
import { policyFixture } from "../helpers/policy-workflow-fixture";
const url = new URL(process.env.DATABASE_URL || "");
const clone = url.port === "55442" && /^\/hua_policy_c[3456]_[a-f0-9]{32}$/.test(url.pathname);
const ci = process.env.CI === "true" && url.port === "55438" && url.pathname === "/hua_companion";
if (process.env.APP_ENV !== "local" || url.hostname !== "127.0.0.1" || (!clone && !ci))
  throw Error("Disposable note-review clone or CI only");
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
    let fd = await mutateSharedPolicyFacts(p, editor, { action: "save", contentKey: key, facts });
    const group = Number(relationID(fd.group));
    const drafts: { zh: PolicyNoteDraft | null; en: PolicyNoteDraft | null } = {
      zh: null,
      en: null,
    };
    let active: number | null = null;
    const call = async (
      locale: "zh" | "en",
      action: SharedNoteInput["action"],
      extra: Partial<SharedNoteInput> = {},
      actor = editor,
    ) => {
      const d = await mutateSharedPolicyNote(p, actor, {
        groupId: group,
        locale,
        action,
        revision: drafts[locale]?.revision,
        factVersion: active,
        ...extra,
      });
      drafts[locale] = d;
      return d;
    };
    const read = async (locale: "zh" | "en") => {
      const r = await readSharedPolicyNote(p, editor, group, locale);
      drafts[locale] = r.draft;
      return r;
    };
    const project = async (locale: "zh" | "en") => {
      const r = await read(locale);
      const v = r.versions.find((v) => v.id === relationID(r.draft?.publishedNoteVersion)) || null;
      return approvedSharedNote(
        group,
        locale,
        Number(relationID(r.group.activeFactVersion)) || null,
        r.draft,
        v,
      );
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
    const snap = async () => ({
      drafts: (
        await p.find({
          collection: "policy-note-drafts",
          pagination: false,
          depth: 0,
          sort: "id",
          where: { group: { equals: group } },
        })
      ).docs,
      versions: (
        await p.find({
          collection: "policy-note-versions",
          pagination: false,
          depth: 0,
          sort: "id",
          where: { group: { equals: group } },
        })
      ).docs,
      tasks: await tasks(),
      audit: (
        await p.find({
          collection: "audit-events",
          pagination: false,
          depth: 0,
          sort: "id",
          where: {
            and: [{ entity: { equals: "policy-note" } }, { recordId: { equals: String(group) } }],
          },
        })
      ).docs,
    });
    const factSnapshot = async () => readSharedPolicyFacts(p, editor, group);
    const publishFact = async () => {
      fd = await mutateSharedPolicyFacts(p, editor, {
        action: "submit",
        groupId: group,
        revision: fd.revision,
      });
      fd = await mutateSharedPolicyFacts(p, reviewer, {
        action: "publish",
        groupId: group,
        revision: fd.revision,
        policyReviewed: true,
      });
      active = Number(relationID((await factSnapshot()).group.activeFactVersion));
    };
    const mail = (await p.count({ collection: "workflow-mail-jobs" })).totalDocs;
    await call("zh", "save", {
      body: { title: "虚构中文", slug: key, publicNotes: "  30天\n仅供演示  " },
    });
    assert.equal(
      (await read("zh")).warning,
      "建议将日期、停留天数或小时数放入事实字段，以免事实更新后说明不一致",
    );
    await assert.rejects(() => call("zh", "submit"), /事实/);
    await publishFact();
    const f1 = active!;
    await read("zh");
    const beforeFacts = await factSnapshot();
    await assert.rejects(
      () => call("zh", "save", { factVersion: null, body: { publicNotes: "stale" } }),
      /事实/,
    );
    await assert.rejects(() => call("zh", "save", { body: { needsReview: false } }));
    await assert.rejects(() => call("zh", "save", { body: { publicNotes: "x" } }, reviewer));
    await assert.rejects(() =>
      readSharedPolicyNote(p, { ...outsider, role: "admin" }, group, "zh"),
    );
    await assert.rejects(() => readSharedPolicyNote(p, null, group, "zh"));
    await call("zh", "save", { body: { publicNotes: "  30天\n仅供演示  " } }, combined);
    await call("zh", "submit", {}, combined);
    await assert.rejects(() => call("zh", "save", { body: { publicNotes: "frozen" } }));
    await assert.rejects(
      () => call("zh", "publish", { noteReviewed: true }, combined),
      /自己|例外/,
    );
    await assert.rejects(() =>
      call("zh", "publish", { noteReviewed: true }, { ...editor, role: "admin" }),
    );
    await assert.rejects(() => call("zh", "return", { note: " " }, reviewer));
    await call("zh", "return", { note: "补充来源说明" }, reviewer);
    assert.equal(drafts.zh?.reviewNote, "补充来源说明");
    await call("zh", "save", { body: { publicNotes: "  30天\n仅供演示  " } });
    await call("zh", "submit");
    await call("en", "save", {
      body: { title: "Fictional", slug: key, publicNotes: "Fictional explanation" },
    });
    await call("en", "submit");
    await call("en", "return", { note: "Please verify" }, reviewer);
    await assert.rejects(() => call("zh", "publish", {}, reviewer), /核实/);
    await p.update({
      collection: "staff",
      id: reviewer.id,
      user: admin,
      data: { contentKinds: [] },
    });
    await assert.rejects(() => call("zh", "publish", { noteReviewed: true }, reviewer), /权限/);
    await p.update({
      collection: "staff",
      id: reviewer.id,
      user: admin,
      data: { contentKinds: ["immigration-policy"] },
    });
    const originalCreate = p.create.bind(p),
      originalUpdate = p.update.bind(p);
    for (const failing of ["task", "audit"] as const) {
      const before = await snap();
      if (failing === "task")
        p.update = (async (args: Parameters<Payload["update"]>[0]) => {
          if (args.collection === "workflow-tasks") throw Error("C3_INJECTED_FAILURE");
          return originalUpdate(args);
        }) as typeof p.update;
      else
        p.create = (async (args: Parameters<Payload["create"]>[0]) => {
          if (args.collection === "audit-events") throw Error("C3_INJECTED_FAILURE");
          return originalCreate(args);
        }) as typeof p.create;
      try {
        await assert.rejects(
          () => call("zh", "publish", { noteReviewed: true }, reviewer),
          /C3_INJECTED_FAILURE/,
        );
      } finally {
        p.create = originalCreate;
        p.update = originalUpdate;
      }
      assert.deepEqual(await snap(), before);
    }
    await call("zh", "publish", { noteReviewed: true }, reviewer);
    const zh1 = Number(relationID(drafts.zh?.publishedNoteVersion));
    assert.equal((await project("zh"))?.publicNotes, "  30天\n仅供演示  ");
    assert.equal(await project("en"), null);
    assert.equal((await tasks()).filter((t) => t.status === "done").length, 1);
    assert.equal((await tasks()).filter((t) => t.status === "open").length, 1);
    assert.equal((await read("en")).draft?.reviewState, "returned");
    assert.deepEqual(await factSnapshot(), beforeFacts);
    await assert.rejects(() =>
      p.update({ collection: "policy-note-versions", id: zh1, data: { publicNotes: "changed" } }),
    );
    await assert.rejects(() => p.delete({ collection: "policy-note-versions", id: zh1 }));
    console.log(
      "PASS independent notes, exact reviewed source, fresh roles, contributor self-review, immutable published copy and atomic task/audit rollback",
    );
    await call("zh", "save", { body: { title: "新标题", publicNotes: "未审核改稿" } });
    assert.equal((await project("zh"))?.title, "虚构中文");
    assert.equal((await project("zh"))?.publicNotes, "  30天\n仅供演示  ");
    await call("zh", "submit");
    await call("zh", "return", { note: "继续修改" }, reviewer);
    assert.equal((await project("zh"))?.title, "虚构中文");
    await assert.rejects(() => call("zh", "save", { body: { slug: key + "-changed" } }), /网址/);
    await call("en", "save", { body: { publicNotes: "" } }, admin);
    await call("en", "submit", {}, admin);
    await assert.rejects(() => call("en", "publish", { noteReviewed: true }, admin), /例外|自己/);
    await call("en", "publish", { noteReviewed: true, overrideReason: "隔离说明例外" }, admin);
    const en1 = Number(relationID(drafts.en?.publishedNoteVersion));
    assert.equal((await project("en"))?.publicNotes, "");
    const audit = (
      await p.find({
        collection: "audit-events",
        where: {
          and: [
            { entity: { equals: "policy-note" } },
            { recordId: { equals: String(group) } },
            { action: { equals: "publish" } },
          ],
        },
        sort: "-id",
      })
    ).docs[0];
    assert.equal((audit.after as { overrideReason: string }).overrideReason, "隔离说明例外");
    await assert.rejects(() => call("zh", "restore", { versionId: en1 }));
    let second = await mutateSharedPolicyFacts(p, editor, {
      action: "save",
      contentKey: key + "-other",
      facts,
    });
    const other = Number(relationID(second.group));
    await assert.rejects(
      () =>
        mutateSharedPolicyNote(p, editor, {
          action: "save",
          groupId: other,
          locale: "zh",
          factVersion: null,
          body: { title: "重复", slug: key, publicNotes: "duplicate" },
        }),
      /已存在/,
    );
    second = await mutateSharedPolicyFacts(p, editor, {
      action: "submit",
      groupId: other,
      revision: second.revision,
    });
    second = await mutateSharedPolicyFacts(p, reviewer, {
      action: "publish",
      groupId: other,
      revision: second.revision,
      policyReviewed: true,
    });
    const otherFact = Number(
      relationID((await readSharedPolicyFacts(p, editor, other)).group.activeFactVersion),
    );
    await assert.rejects(() =>
      mutateSharedPolicyNote(p, editor, {
        action: "restore",
        groupId: other,
        locale: "zh",
        factVersion: otherFact,
        versionId: zh1,
      }),
    );
    await call("zh", "save", { body: { publicNotes: "待审旧事实说明" } });
    await call("zh", "submit");
    const stale = { revision: drafts.zh!.revision, factVersion: f1 };
    fd = await mutateSharedPolicyFacts(p, editor, {
      action: "save",
      groupId: group,
      revision: fd.revision,
      facts: { maximumStay: 45 },
    });
    await publishFact();
    const f2 = active!;
    await assert.rejects(() => call("zh", "publish", { ...stale, noteReviewed: true }, reviewer));
    await read("zh");
    await read("en");
    assert.equal(await project("zh"), null);
    assert.equal(await project("en"), null);
    await assert.rejects(() => call("zh", "submit"), /事实/);
    await call("zh", "save", { body: { publicNotes: "新版说明" } });
    await call("zh", "submit");
    await call("zh", "publish", { noteReviewed: true }, reviewer);
    assert.equal((await project("zh"))?.publicNotes, "新版说明");
    assert.equal(await project("en"), null);
    assert.equal((await tasks()).filter((t) => t.status === "open").length, 1);
    await call("en", "save", { body: { publicNotes: "New English" } });
    await call("en", "submit");
    const enInput = {
      action: "publish" as const,
      groupId: group,
      locale: "en" as const,
      factVersion: f2,
      revision: drafts.en!.revision,
      noteReviewed: true,
    };
    fd = await mutateSharedPolicyFacts(p, editor, {
      action: "save",
      groupId: group,
      revision: fd.revision,
      facts: { maximumStay: 60 },
    });
    fd = await mutateSharedPolicyFacts(p, editor, {
      action: "submit",
      groupId: group,
      revision: fd.revision,
    });
    const race = await Promise.allSettled([
      mutateSharedPolicyFacts(p, reviewer, {
        action: "publish",
        groupId: group,
        revision: fd.revision,
        policyReviewed: true,
      }),
      mutateSharedPolicyNote(p, reviewer, enInput),
    ]);
    assert.equal(race[0].status, "fulfilled");
    if (race[0].status === "fulfilled") fd = race[0].value;
    active = Number(relationID((await factSnapshot()).group.activeFactVersion));
    assert.notEqual(active, f2);
    await read("zh");
    await read("en");
    assert.equal(await project("zh"), null);
    assert.equal(await project("en"), null);
    assert.equal((await tasks()).filter((t) => t.status === "open").length, 2);
    console.log(
      "PASS working edits preserve approved text; independent language approval, numeric warning, stale fact rejection and fact/note publication race",
    );
    await call("zh", "save", { body: { publicNotes: "当前事实说明" } });
    await call("zh", "submit");
    const same = {
      action: "publish" as const,
      groupId: group,
      locale: "zh" as const,
      factVersion: active,
      revision: drafts.zh!.revision,
      noteReviewed: true,
    };
    const twice = await Promise.allSettled([
      mutateSharedPolicyNote(p, reviewer, same),
      mutateSharedPolicyNote(p, reviewer, same),
    ]);
    assert.equal(twice.filter((x) => x.status === "fulfilled").length, 1);
    await read("zh");
    for (const locale of ["zh", "en"] as const) {
      await call(locale, "save", { body: { publicNotes: locale + " current" } });
      await call(locale, "submit");
    }
    const languageInputs = (["zh", "en"] as const).map((locale) => ({
      action: "publish" as const,
      groupId: group,
      locale,
      factVersion: active,
      revision: drafts[locale]!.revision,
      noteReviewed: true,
    }));
    const both = await Promise.all(
      languageInputs.map((input) => mutateSharedPolicyNote(p, reviewer, input)),
    );
    assert.equal(both.length, 2);
    const stableFacts = await factSnapshot();
    await read("zh");
    await read("en");
    await call("zh", "unpublish", {}, reviewer);
    assert.equal(await project("zh"), null);
    assert.equal((await project("en"))?.publicNotes, "en current");
    assert.equal((await tasks()).filter((t) => t.status === "open").length, 1);
    assert.deepEqual(await factSnapshot(), stableFacts);
    await call("zh", "restore", { versionId: zh1 });
    assert.equal(drafts.zh?.publicNotes, "  30天\n仅供演示  ");
    assert.equal(drafts.zh?.reviewState, "draft");
    assert.equal(await project("zh"), null);
    await call("zh", "submit");
    await call("zh", "publish", { noteReviewed: true }, reviewer);
    assert.equal((await project("zh"))?.publicNotes, "  30天\n仅供演示  ");
    fd = await mutateSharedPolicyFacts(p, reviewer, {
      action: "unpublish",
      groupId: group,
      revision: fd.revision,
    });
    active = null;
    await read("zh");
    await assert.rejects(() => call("zh", "submit"), /事实/);
    assert.equal(await project("zh"), null);
    await mutateSharedPolicyFacts(p, reviewer, {
      action: "unpublish",
      groupId: other,
      revision: second.revision,
    });
    assert.equal((await p.count({ collection: "workflow-mail-jobs" })).totalDocs, mail);
    console.log(
      "PASS same-language single approval, two-language concurrency, cross-policy/language restore denial, stable routes, scoped task reopen, fact unpublish and no mail",
    );
  });
} finally {
  await p.destroy();
}
process.exit(0);
