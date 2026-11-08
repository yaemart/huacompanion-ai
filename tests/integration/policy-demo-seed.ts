import "dotenv/config";
import assert from "node:assert/strict";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { seedSharedPolicyDemo } from "../../scripts/lib/policy-demo-seed";
import { policyFixture } from "../helpers/policy-workflow-fixture";
import { mutateSharedPolicyFacts } from "../../src/server/immigration/shared-facts-service";
const url = new URL(process.env.DATABASE_URL || "");
const clone = url.port === "55442" && /^\/hua_policy_c6_[a-f0-9]{32}$/.test(url.pathname);
const ci = process.env.CI === "true" && url.port === "55438" && url.pathname === "/hua_companion";
if (url.hostname !== "127.0.0.1" || (!clone && !ci) || process.env.APP_ENV !== "local")
  throw Error("Disposable C6 or CI only");
const p = await getPayload({ config });
try {
  await policyFixture(p, async ({ editor }) => {
    const where = { contentKey: { in: [1, 2, 3, 4].map((i) => `demo-shared-policy-${i}`) } };
    assert.equal((await p.count({ collection: "policy-groups", where })).totalDocs, 0);
    const oldVersions = (await p.count({ collection: "policy-fact-versions" })).totalDocs;
    await seedSharedPolicyDemo(p, editor, "2026-11-08");
    const groups = (
      await p.find({ collection: "policy-groups", where, sort: "contentKey", depth: 0 })
    ).docs;
    assert.equal(groups.length, 4);
    assert.ok(groups.every((g) => !g.activeFactVersion));
    const ids = groups.map((g) => g.id);
    const read = async () => ({
      facts: (
        await p.find({
          collection: "policy-fact-drafts",
          where: { group: { in: ids } },
          pagination: false,
          sort: "id",
        })
      ).docs,
      notes: (
        await p.find({
          collection: "policy-note-drafts",
          where: { group: { in: ids } },
          pagination: false,
          sort: "id",
        })
      ).docs,
    });
    const before = await read();
    assert.equal(before.facts.length, 4);
    assert.equal(before.notes.length, 8);
    assert.ok([...before.facts, ...before.notes].every((d) => d.reviewState === "draft"));
    assert.ok(
      before.notes.every((d) => d.needsReview && !d.publishedNoteVersion && !d.basedOnFactVersion),
    );
    await seedSharedPolicyDemo(p, editor, "2026-11-09");
    assert.deepEqual(await read(), before);
    const first = before.facts[0];
    await mutateSharedPolicyFacts(p, editor, {
      action: "save",
      groupId: groups[0].id,
      revision: first.revision,
      facts: { ...(first.facts as object), maximumStay: 45 },
    });
    const edited = await read();
    await seedSharedPolicyDemo(p, editor, "2026-11-10");
    assert.deepEqual(await read(), edited);
    assert.equal((await p.count({ collection: "policy-fact-versions" })).totalDocs, oldVersions);
    await p.delete({ collection: "policy-note-drafts", where: { group: { in: ids } } });
    await p.delete({ collection: "policy-fact-drafts", where: { group: { in: ids } } });
    for (const g of groups) await p.delete({ collection: "policy-groups", id: g.id });
    console.log(
      "PASS draft-only 4 facts/8 notes, no publication or approval, idempotent retry and operator edits preserved",
    );
  });
} finally {
  await p.destroy();
}
process.exit(0);
