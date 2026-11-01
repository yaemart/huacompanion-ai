import "dotenv/config";
import assert from "node:assert/strict";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { mutateContent, listPublished } from "../../src/server/content/service";
import { agentAction } from "../../src/server/content-agent/service";
import type { ContentBody } from "../../src/lib/content-model";
import { policyFacts, policyFixture } from "../helpers/policy-workflow-fixture";
if (process.env.APP_ENV !== "local") throw Error("Local only");
const p = await getPayload({ config });
try {
  await policyFixture(p, async ({ key, body, admin, editor, reviewer, combined, outsider }) => {
    let draft = await mutateContent(p, editor, {
      action: "save",
      body,
      policy: { countryNameZh: "未完成的虚构草稿" },
    });
    const ref = (draft.body as unknown as ContentBody).policyRef;
    assert.ok(ref, "Policy save must link a real master record");
    const master = () => p.findByID({ collection: "immigration-policies", id: ref.id, depth: 0 });
    assert.equal((await master()).policyKey, `${key}:en`);
    assert.ok(!JSON.stringify(draft.body).includes("countryNameZh"));
    for (const user of [null, outsider, { ...editor, active: false }])
      await assert.rejects(() =>
        mutateContent(p, user, { action: "save", id: draft.id, revision: draft.revision, body }),
      );
    await assert.rejects(() => mutateContent(p, reviewer, { action: "save", body }));
    await assert.rejects(() =>
      mutateContent(p, editor, {
        action: "save",
        id: draft.id,
        revision: draft.revision,
        body,
        policy: { status: "published" },
      }),
    );
    await assert.rejects(() =>
      p.update({
        collection: "content-drafts",
        id: draft.id,
        data: { title: "Direct AI-like bypass" },
      }),
    );
    const before = await p.count({ collection: "immigration-policies" });
    await assert.rejects(() =>
      mutateContent(p, editor, {
        action: "save",
        body: { ...body, contentKey: `${key}-collision` },
        policy: policyFacts(editor.id),
      }),
    );
    assert.equal(
      (await p.count({ collection: "immigration-policies" })).totalDocs,
      before.totalDocs,
    );
    console.log(
      "PASS partial master/reference, scope, field allowlist, bypass guard and atomic save rollback",
    );

    const step = async (action: string, user = editor, extra: object = {}) => {
      draft = await mutateContent(p, user, {
        action,
        id: draft.id,
        revision: draft.revision,
        ...extra,
      });
      return draft;
    };
    await step("submit");
    await assert.rejects(() => step("save", editor, { body, policy: policyFacts(editor.id) }), {
      status: 409,
    });
    await assert.rejects(() => step("publish", reviewer, { policyReviewed: true }));
    assert.equal(
      (await p.find({ collection: "content-published", where: { draftId: { equals: draft.id } } }))
        .totalDocs,
      0,
    );
    await step("return", reviewer, { note: "Complete facts" });
    await step("save", editor, {
      body: {
        ...body,
        policy: { countryCode: "ZZ", internalNotes: "Forged body" },
        policyRef: { id: 99999, revision: 1 },
      },
      policy: policyFacts(editor.id),
    });
    assert.ok(!(draft.body as unknown as ContentBody).policy);
    const initialPolicyRevision = (await master()).revision;
    const initialVersion = (
      await p.findVersions({
        collection: "content-drafts",
        where: {
          and: [
            { parent: { equals: draft.id } },
            { "version.revision": { equals: draft.revision } },
          ],
        },
        limit: 1,
      })
    ).docs[0];
    assert.ok(initialVersion);
    await step("submit");
    await assert.rejects(() => step("publish", editor, { policyReviewed: true }), { status: 403 });
    await assert.rejects(() => step("publish", reviewer));
    await step("publish", reviewer, { policyReviewed: true });
    assert.equal((await master()).status, "published");
    const snapshot = async () =>
      (
        await p.find({
          collection: "content-published",
          where: { draftId: { equals: draft.id } },
          limit: 1,
        })
      ).docs[0];
    const original = await snapshot();
    assert.ok(JSON.stringify(original.body).includes('"countryCode":"XY"'));
    for (const hidden of ["internalNotes", "verifiedBy", "policyRef", String(ref.id) + ":en"])
      assert.ok(!JSON.stringify(original.body).includes(hidden));
    for (const flag of [undefined, "true"]) {
      if (flag) process.env.VISA_CHECKER_ENABLED = flag;
      else delete process.env.VISA_CHECKER_ENABLED;
      assert.ok(!(await listPublished(p, "en")).some((d) => d.kind === "immigration-policy"));
    }
    delete process.env.VISA_CHECKER_ENABLED;
    await step("save", editor, {
      body,
      policy: { maxStayDays: 9, internalNotes: "Unreviewed private change" },
    });
    assert.deepEqual((await snapshot()).body, original.body);
    await step("restore", editor, { versionId: initialVersion.id });
    assert.equal((await master()).maxStayDays, 3);
    assert.ok((await master()).revision > initialPolicyRevision);
    assert.deepEqual((await snapshot()).body, original.body);
    await step("submit");
    const races = await Promise.allSettled([
      step("publish", reviewer, { policyReviewed: true }),
      step("publish", reviewer, { policyReviewed: true }),
    ]);
    assert.equal(races.filter((r) => r.status === "fulfilled").length, 1);
    const fresh = await p.findByID({ collection: "content-drafts", id: draft.id });
    draft = fresh;
    await step("unpublish", reviewer);
    assert.equal((await snapshot()).active, false);
    assert.equal((await master()).status, "draft");
    const revision = draft.revision;
    const saves = await Promise.allSettled(
      ["A", "B"].map((title) =>
        mutateContent(p, editor, {
          action: "save",
          id: draft.id,
          revision,
          body: { ...body, title },
          policy: { maxStayDays: 5 },
        }),
      ),
    );
    assert.equal(saves.filter((r) => r.status === "fulfilled").length, 1);
    draft = await p.findByID({ collection: "content-drafts", id: draft.id });
    console.log(
      "PASS review freeze, explicit verification, publication isolation, historical restore, unpublish and concurrent revision protection",
    );

    await step("save", editor, { body, policy: { verifiedBy: outsider.id } });
    await step("submit");
    await assert.rejects(() => step("publish", reviewer, { policyReviewed: true }), {
      status: 403,
    });
    await step("return", reviewer);
    await step("save", editor, { body, policy: { verifiedBy: editor.id } });
    await p.update({ collection: "staff", id: editor.id, user: admin, data: { active: false } });
    await assert.rejects(() => step("submit", editor), { status: 403 });
    await step("submit", combined);
    await assert.rejects(() => step("publish", reviewer, { policyReviewed: true }), {
      status: 403,
    });
    await p.update({ collection: "staff", id: editor.id, user: admin, data: { active: true } });
    await assert.rejects(() => step("publish", combined, { policyReviewed: true }), {
      status: 403,
    });
    await step("publish", admin, { policyReviewed: true });
    const events = await p.find({
      collection: "content-events",
      where: { draftId: { equals: draft.id } },
      limit: 100,
    });
    assert.ok(events.docs.some((e) => e.action === "publish" && e.actor === reviewer.id));
    assert.ok(!JSON.stringify(events.docs.map((e) => e.snapshot)).includes("internalNotes"));
    await step("save", admin, { body });
    await step("submit", admin);
    await assert.rejects(() => step("publish", admin, { policyReviewed: true }), { status: 403 });
    await step("publish", admin, {
      policyReviewed: true,
      overrideReason: "Fictional local fixture exception",
    });
    assert.ok(
      (
        await p.find({
          collection: "content-events",
          where: {
            and: [
              { draftId: { equals: draft.id } },
              { overrideReason: { equals: "Fictional local fixture exception" } },
            ],
          },
        })
      ).totalDocs,
    );
    console.log(
      "PASS verifier authorization/active state, contributor self-review and administrator exception audit",
    );

    const task = await agentAction(p, editor, {
      action: "create",
      kind: "draft",
      title: "Fictional AI bypass test",
      material: "Fictional material",
      draftId: draft.id,
      revision: draft.revision,
    });
    const input = { ...(task.input as object), targetId: draft.id, targetRevision: draft.revision };
    await p.update({
      collection: "content-agent-tasks",
      id: task.id,
      data: {
        input,
        status: "succeeded",
        result: { title: "AI bypass", blocks: [], sourceIds: [], questions: [] },
      },
    });
    await assert.rejects(() => agentAction(p, editor, { action: "adopt", id: task.id }));
    assert.equal(
      (await p.findByID({ collection: "content-drafts", id: draft.id })).revision,
      draft.revision,
    );
    await p.delete({ collection: "content-agent-tasks", id: task.id });
    await p.update({
      collection: "immigration-policies",
      id: ref.id,
      data: { policyKey: `${key}-foreign:en` },
    });
    await assert.rejects(() => step("submit", editor), { status: 409 });
    await p.update({
      collection: "immigration-policies",
      id: ref.id,
      data: { policyKey: `${key}:en` },
    });
    await p.db.deleteVersions({
      collection: "immigration-policies",
      where: {
        and: [
          { parent: { equals: ref.id } },
          { "version.revision": { equals: initialPolicyRevision } },
        ],
      },
    });
    const beforeMissingHistory = await master();
    await assert.rejects(() => step("restore", editor, { versionId: initialVersion.id }), {
      status: 409,
    });
    assert.deepEqual(await master(), beforeMissingHistory);
    console.log(
      "PASS foreign policy ownership and missing historical policy versions rejected without changes",
    );

    let atomic = await mutateContent(p, editor, {
      action: "save",
      body: { ...body, contentKey: `${key}-atomic`, slug: `${key}-atomic` },
      policy: policyFacts(editor.id),
    });
    atomic = await mutateContent(p, editor, {
      action: "submit",
      id: atomic.id,
      revision: atomic.revision,
    });
    const atomicRef = (atomic.body as unknown as ContentBody).policyRef!;
    const collision = await p.create({
      collection: "content-published",
      data: {
        draftId: -atomic.id,
        routeKey: atomic.routeKey,
        active: false,
        revision: 1,
        body: {},
        publishedBy: reviewer.id,
        publishedAt: new Date().toISOString(),
      },
    });
    try {
      await assert.rejects(() =>
        mutateContent(p, reviewer, {
          action: "publish",
          id: atomic.id,
          revision: atomic.revision,
          policyReviewed: true,
        }),
      );
      assert.equal(
        (await p.findByID({ collection: "immigration-policies", id: atomicRef.id })).status,
        "draft",
      );
      assert.equal(
        (await p.findByID({ collection: "content-drafts", id: atomic.id })).revision,
        atomic.revision,
      );
    } finally {
      await p.delete({ collection: "content-published", id: collision.id });
    }
    console.log(
      "PASS snapshot write failure rolls back policy status and workflow revision together",
    );
    await p.update({
      collection: "immigration-policies",
      id: ref.id,
      data: { revision: (await master()).revision + 1 },
    });
    await assert.rejects(() => step("submit", editor), { status: 409 });
    console.log("PASS AI adoption cannot bypass policy writes; stale master reference rejected");
  });
} finally {
  await p.destroy();
}
process.exit(0);
