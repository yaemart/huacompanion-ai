import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { assertDemo } from "../../scripts/lib/demo-environment.mjs";
const dir = process.env.HUA_DEMO_ROOT || "";
const state = JSON.parse(readFileSync(path.join(dir, "state.json"), "utf8"));
assertDemo(state);
assert.equal(process.env.DATABASE_URL, state.databaseURL);
const { getPayload } = await import("payload");
const { default: config } = await import("../../src/payload.config");
const { businessRead } = await import("../../src/server/business/service");
const { mutateContent } = await import("../../src/server/content/service");
const p = await getPayload({ config });
async function cleanupSelfCheck() {
  const drafts = await p.find({
    collection: "content-drafts",
    where: { identity: { equals: "demo-self-review-check:zh" } },
  });
  for (const draft of drafts.docs) {
    for (const collection of ["content-published", "content-quality", "content-events"] as const)
      await p.delete({ collection, where: { draftId: { equals: draft.id } } });
    await p.delete({ collection: "content-drafts", id: draft.id });
  }
}
try {
  await cleanupSelfCheck();
  const people = await Promise.all(
    ["admin", "manager", "operations", "reviewer", "newcomer"].map(async (key) => {
      const result = await p.login({ collection: "staff", data: state.accounts[key] });
      assert.ok(result.token);
      assert.ok(result.user);
      return result.user;
    }),
  );
  const [admin, manager, operations, reviewer, newcomer] = people;
  assert.equal(manager.additionalRoles?.includes("reviewer"), false);
  assert.equal(manager.additionalRoles?.includes("admin"), false);
  assert.equal(newcomer.additionalRoles?.includes("editor"), true);
  assert.equal(operations.additionalRoles?.includes("editor"), true);
  assert.equal(reviewer.additionalRoles?.includes("admin"), false);
  const counts: Record<string, number> = {};
  for (const kind of ["immigration-policy", "guide", "exhibition"]) {
    counts[kind] = (
      await p.count({ collection: "content-drafts", where: { kind: { equals: kind } } })
    ).totalDocs;
    assert.equal(counts[kind], kind === "guide" ? 12 : kind === "exhibition" ? 6 : 0);
  }
  assert.equal((await p.count({ collection: "policy-groups" })).totalDocs, 4);
  assert.equal((await p.count({ collection: "policy-fact-drafts" })).totalDocs, 4);
  assert.equal((await p.count({ collection: "policy-note-drafts" })).totalDocs, 8);
  const all = await p.find({ collection: "inquiries", pagination: false, depth: 0 });
  assert.equal(all.totalDocs, 5);
  const own = await p.find({ collection: "inquiries", user: operations, overrideAccess: false });
  assert.equal(own.totalDocs, 2);
  const team = await p.find({ collection: "inquiries", user: manager, overrideAccess: false });
  assert.equal(team.totalDocs, 5);
  const newcomerInquiries = await p.find({
    collection: "inquiries",
    user: newcomer,
    overrideAccess: false,
  });
  assert.equal(newcomerInquiries.totalDocs, 1);
  const providers = await p.find({ collection: "providers", pagination: false });
  assert.equal(providers.totalDocs, 3);
  assert.ok(providers.docs.every((d) => !d.publicApproved));
  const c = (await businessRead(p, operations)).cases[0];
  const low = await businessRead(p, operations, c.id);
  assert.equal(low.quotes.length, 1);
  assert.equal("internalCostMinor" in low.quotes[0], false);
  const high = await businessRead(p, manager, c.id);
  assert.equal(high.quotes[0].internalCostMinor, 12000);
  await assert.rejects(() => businessRead(p, reviewer));
  const draft = (
    await p.find({
      collection: "content-drafts",
      where: { identity: { equals: "demo-guide-guide-6:zh" } },
    })
  ).docs[0];
  assert.equal(draft.reviewState, "review");
  await assert.rejects(() =>
    mutateContent(p, operations, { action: "publish", id: draft.id, revision: draft.revision }),
  );
  await assert.rejects(() =>
    mutateContent(p, manager, { action: "publish", id: draft.id, revision: draft.revision }),
  );
  const published = (
    await p.find({
      collection: "content-published",
      where: { active: { equals: true } },
      pagination: false,
    })
  ).docs;
  assert.equal(published.length, 32);
  for (const snapshot of published) {
    const current = await p.findByID({ collection: "content-drafts", id: snapshot.draftId });
    assert.equal(current.submittedBy, operations.id);
    assert.equal(snapshot.publishedBy, reviewer.id);
    assert.ok(
      JSON.stringify(snapshot).includes("演示") || JSON.stringify(snapshot).includes("DEMO"),
    );
  }
  assert.equal((await p.findGlobal({ slug: "workflow-settings" })).emailEnabled, false);
  assert.equal((await p.findGlobal({ slug: "customer-settings" })).enabled, false);
  assert.equal((await p.findGlobal({ slug: "support-settings" })).textChat, false);
  const selfDraft = await mutateContent(p, admin, {
    action: "save",
    body: {
      contentKey: "demo-self-review-check",
      kind: "guide",
      locale: "zh",
      slug: "demo-self-review-check",
      title: "演示·禁止自审检查",
      blocks: [{ type: "paragraph", text: "仅用于隔离自审回归" }],
      sources: [{ id: "demo", title: "虚构来源", url: "https://example.invalid/demo" }],
    },
  });
  const submitted = await mutateContent(p, admin, {
    action: "submit",
    id: selfDraft.id,
    revision: selfDraft.revision,
  });
  await assert.rejects(
    () =>
      mutateContent(p, admin, {
        action: "publish",
        id: submitted.id,
        revision: submitted.revision,
      }),
    /管理员须填写例外原因/,
  );
  await mutateContent(p, admin, {
    action: "publish",
    id: submitted.id,
    revision: submitted.revision,
    overrideReason: "本机虚构数据：管理员例外回归测试",
  });
  await cleanupSelfCheck();
  const quotes = await p.find({ collection: "service-quotes", pagination: false });
  assert.equal(quotes.totalDocs, 2);
  assert.ok(quotes.docs.every((q) => q.status === "draft" && !q.aiTask && !q.reviewStatus));
  assert.ok(admin.id);
  console.log(
    JSON.stringify({
      passed: true,
      fiveAccounts: true,
      counts,
      inquiries: 5,
      published: 32,
      sharedPolicyGroups: 4,
    }),
  );
} finally {
  await cleanupSelfCheck();
  await p.destroy();
}
process.exit(0);
