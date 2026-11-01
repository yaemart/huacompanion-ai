import "dotenv/config";
import assert from "node:assert/strict";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { mutateContent, listPublished } from "../../src/server/content/service";
import { listPublicPolicies } from "../../src/server/immigration/public";
import { queryImmigrationPolicies } from "../../src/lib/immigration-policy-query";
import { policyFixture, policyFacts } from "../helpers/policy-workflow-fixture";

if (process.env.APP_ENV !== "local") throw Error("Local only");
const p = await getPayload({ config });
const oldFlag = process.env.VISA_CHECKER_ENABLED;
try {
  process.env.VISA_CHECKER_ENABLED = "true";
  await policyFixture(p, async ({ key, body, editor, reviewer, admin }) => {
    const input = { nationalityISO: "XY", arrivalDate: "2026-12-31" };
    const guideKey = `${key}-visa-guide`;
    async function context() {
      const guide = (await listPublished(p, "en")).find((row) => row.contentKey === guideKey);
      return {
        verifiedOnOrBefore: "2026-11-01",
        visaGuide: guide ? { href: `/en/guides/${guide.slug}`, title: guide.title } : null,
      };
    }
    const query = async () =>
      queryImmigrationPolicies(input, await listPublicPolicies(p, "en"), await context());
    let draft = await mutateContent(p, editor, {
      action: "save",
      body,
      policy: { ...policyFacts(editor.id), validUntil: "2026-12-31" },
    });
    assert.equal((await query()).status, "unconfirmed");
    assert.equal((await query()).visaGuide, null);
    draft = await mutateContent(p, editor, {
      action: "submit",
      id: draft.id,
      revision: draft.revision,
    });
    assert.equal((await query()).status, "unconfirmed");
    draft = await mutateContent(p, reviewer, {
      action: "publish",
      id: draft.id,
      revision: draft.revision,
      policyReviewed: true,
    });
    const matched = await query();
    assert.equal(matched.status, "matched");
    assert.equal(matched.matches.length, 1);
    assert.deepEqual(matched.matches[0].stay, { unit: "days", maximum: 3 });
    assert.equal(matched.matches[0].officialSourceUrl, "https://example.invalid/policy");
    assert.equal(matched.matches[0].lastVerifiedOn, "2026-01-01");
    assert.doesNotMatch(
      JSON.stringify(matched),
      /verifiedBy|internalNotes|policyRef|revision|@example.invalid/,
    );
    assert.equal(
      queryImmigrationPolicies(
        { ...input, arrivalDate: "2027-01-01" },
        await listPublicPolicies(p, "en"),
        await context(),
      ).status,
      "unconfirmed",
    );
    assert.equal(
      queryImmigrationPolicies(input, [policyFacts(editor.id), draft], await context()).status,
      "unconfirmed",
    );
    draft = await mutateContent(p, editor, {
      action: "save",
      id: draft.id,
      revision: draft.revision,
      body,
      policy: { ...policyFacts(editor.id), validUntil: "2026-12-31", maxStayDays: 9 },
    });
    assert.deepEqual((await query()).matches[0].stay, { unit: "days", maximum: 3 });
    await mutateContent(p, reviewer, {
      action: "unpublish",
      id: draft.id,
      revision: draft.revision,
    });
    assert.equal((await query()).status, "unconfirmed");
    console.log(
      "PASS draft/submitted hidden; published cutoff inclusive; revised draft preserves formal snapshot; unpublished hidden; no private fields",
    );

    let guide = await mutateContent(p, admin, {
      action: "save",
      body: {
        ...body,
        kind: "guide",
        contentKey: guideKey,
        slug: guideKey,
        title: "Fictional visa application guide",
        sources: [
          { id: "fictional", title: "Fictional source", url: "https://example.invalid/visa" },
        ],
      },
    });
    assert.equal((await query()).visaGuide, null);
    guide = await mutateContent(p, admin, {
      action: "submit",
      id: guide.id,
      revision: guide.revision,
    });
    assert.equal((await query()).visaGuide, null);
    guide = await mutateContent(p, admin, {
      action: "publish",
      id: guide.id,
      revision: guide.revision,
      overrideReason: "Fictional query integration fixture",
    });
    const unconfirmed = await query();
    assert.equal(unconfirmed.status, "unconfirmed");
    assert.match(unconfirmed.notice.zh, /该日期的政策尚未确认/);
    assert.deepEqual(unconfirmed.visaGuide, {
      href: `/en/guides/${guideKey}`,
      title: "Fictional visa application guide",
    });
    await assert.rejects(
      () =>
        mutateContent(p, admin, { action: "unpublish", id: guide.id, revision: guide.revision }),
      { status: 403 },
    );
    await mutateContent(p, admin, {
      action: "unpublish",
      id: guide.id,
      revision: guide.revision,
      overrideReason: "Fictional query integration fixture cleanup",
    });
    assert.equal((await query()).visaGuide, null);
    console.log(
      "PASS visa guide supplied only through real published-guide lifecycle; no fabricated fallback",
    );
  });
} finally {
  if (oldFlag === undefined) delete process.env.VISA_CHECKER_ENABLED;
  else process.env.VISA_CHECKER_ENABLED = oldFlag;
  await p.destroy();
}
process.exit(0);
