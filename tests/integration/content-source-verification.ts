import assert from "node:assert/strict";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { shanghaiToday } from "../../src/lib/exhibitions";
import { relationID } from "../../src/cms/access";
import { mutateContent, readPublished } from "../../src/server/content/service";
import { mutateSharedPolicyFacts } from "../../src/server/immigration/shared-facts-service";
import { policyFixture, policyFacts } from "../helpers/policy-workflow-fixture";

const db = new URL(process.env.DATABASE_URL || "");
assert.equal(process.env.APP_ENV, "local");
assert.equal(db.hostname, "127.0.0.1");
assert.ok(
  (db.port === "55442" && /^\/hua_source_verify_[a-f0-9]{32}$/.test(db.pathname)) ||
    (db.port === "55438" && db.pathname === "/hua_companion" && process.env.CI === "true"),
);
const p = await getPayload({ config });
try {
  await policyFixture(p, async ({ key, outsider, admin, editor, reviewer }) => {
    const today = shanghaiToday();
    const official = {
      id: "official",
      title: "虚构来源",
      url: "https://example.invalid/source",
    };
    const visaKey = `${key}-visa`;
    process.env.VISA_GUIDE_CONTENT_KEY = visaKey;
    process.env.VISA_CHECKER_ENABLED = "true";
    const base = {
      kind: "guide",
      locale: "zh",
      title: "虚构内容，仅供流程验收",
      blocks: [{ type: "paragraph", text: "虚构资料，不供实际使用。" }],
    };
    for (const example of [
      { contentKey: `${key}-policy`, sourceTopic: "policy" },
      { contentKey: `${key}-medical`, category: 3 },
      { contentKey: visaKey, locale: "en" },
    ]) {
      const body = { ...base, slug: example.contentKey, ...example, sources: [] };
      let draft = await mutateContent(p, outsider, { action: "save", body });
      const submit = () =>
        mutateContent(p, outsider, { action: "submit", id: draft.id, revision: draft.revision });
      const publish = () =>
        mutateContent(p, admin, { action: "publish", id: draft.id, revision: draft.revision });
      const saveSources = (sources: object[]) =>
        mutateContent(p, outsider, {
          action: "save",
          id: draft.id,
          revision: draft.revision,
          body: { ...body, sources },
        });
      await assert.rejects(submit, /添加.*来源/);
      draft = await saveSources([
        { ...official, checkedAt: today },
        { ...official, id: "extra" },
      ]);
      await assert.rejects(submit, /第 2 条.*核实日期/);

      // Older pending drafts may predate the new gate. Publishing must still check them.
      draft = await p.update({
        collection: "content-drafts",
        id: draft.id,
        data: { reviewState: "review" },
      });
      await assert.rejects(publish, /第 2 条.*核实日期/);
      draft = await mutateContent(p, admin, {
        action: "return",
        id: draft.id,
        revision: draft.revision,
        note: "请补充第二条虚构来源的核实日期",
      });
      draft = await saveSources([{ ...official, checkedAt: "2999-01-01" }]);
      await assert.rejects(submit, /晚于今天/);
      draft = await saveSources([{ ...official, checkedAt: today }]);
      draft = await submit();
      assert.equal(draft.reviewState, "review");
      draft = await publish();
      assert.equal(draft.reviewState, "approved");
      const live = await readPublished(p, "guide", draft.locale, draft.slug);
      assert.equal(live?.sources[0]?.checkedAt, today);
    }
    const regularKey = `${key}-regular`;
    const regular = await mutateContent(p, outsider, {
      action: "save",
      body: { ...base, contentKey: regularKey, slug: regularKey, sources: [official] },
    });
    assert.equal(
      (
        await mutateContent(p, outsider, {
          action: "submit",
          id: regular.id,
          revision: regular.revision,
        })
      ).reviewState,
      "review",
    );

    const { maxStayDays, publicNotes, ...legacy } = policyFacts(editor.id);
    assert.ok(publicNotes);
    const facts = { ...legacy, maximumStay: maxStayDays, stayUnit: "days", lastVerifiedOn: null };
    let policy = await mutateSharedPolicyFacts(p, editor, {
      action: "save",
      contentKey: key,
      facts,
    });
    const groupId = Number(relationID(policy.group));
    const submitFacts = () =>
      mutateSharedPolicyFacts(p, editor, { action: "submit", groupId, revision: policy.revision });
    await assert.rejects(submitFacts, /核实日期/);
    policy = await mutateSharedPolicyFacts(p, editor, {
      action: "save",
      groupId,
      revision: policy.revision,
      facts: { lastVerifiedOn: today },
    });
    policy = await submitFacts();
    policy = await mutateSharedPolicyFacts(p, reviewer, {
      action: "publish",
      groupId,
      revision: policy.revision,
      policyReviewed: true,
    });
    assert.equal(policy.reviewState, "approved");
    await mutateSharedPolicyFacts(p, reviewer, {
      action: "unpublish",
      groupId,
      revision: policy.revision,
    });
  });
  console.log(
    "PASS fictional policy, medical and visa verification, pending gate and ordinary draft",
  );
} finally {
  await p.destroy();
}
process.exit(0);
