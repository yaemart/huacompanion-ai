import "dotenv/config";
import assert from "node:assert/strict";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { mutateContent } from "../../src/server/content/service";
import { readPolicyEditor } from "../../src/server/immigration/editor";
import { listPublicPolicies } from "../../src/server/immigration/public";
import { queryImmigrationPolicies } from "../../src/lib/immigration-policy-query";
import { policyFacts, policyFixture } from "../helpers/policy-workflow-fixture";
import type { ContentBody } from "../../src/lib/content-model";
if (process.env.APP_ENV !== "local") throw Error("Local isolated only");
const p = await getPayload({ config });
try {
  await policyFixture(p, async ({ body, editor, reviewer }) => {
    let draft = await mutateContent(p, editor, {
      action: "save",
      body,
      policy: {
        ...policyFacts(editor.id),
        policyType: "transit-240h",
        maxStayDays: null,
        maxStayHours: 144,
        portsAndRegions: [],
      },
    });
    const ref = (draft.body as unknown as ContentBody).policyRef!;
    await assert.rejects(
      () =>
        mutateContent(p, editor, {
          action: "submit",
          id: draft.id,
          revision: draft.revision,
        }),
      /口岸/,
    );
    assert.equal(
      (await p.findByID({ collection: "content-drafts", id: draft.id })).reviewState,
      "draft",
    );
    const saved = await readPolicyEditor(p, editor, draft.id);
    assert.equal(saved.policy.maxStayHours, 144);
    assert.equal(saved.policy.maxStayDays, null);
    draft = await mutateContent(p, editor, {
      action: "save",
      id: draft.id,
      revision: draft.revision,
      body: draft.body,
      policy: { portsAndRegions: ["虚构第三国联程条件"] },
    });
    draft = await mutateContent(p, editor, {
      action: "submit",
      id: draft.id,
      revision: draft.revision,
    });
    await assert.rejects(() =>
      mutateContent(p, editor, {
        action: "publish",
        id: draft.id,
        revision: draft.revision,
        policyReviewed: true,
      }),
    );
    draft = await mutateContent(p, reviewer, {
      action: "publish",
      id: draft.id,
      revision: draft.revision,
      policyReviewed: true,
    });
    const formal = (
      await p.find({
        collection: "content-published",
        where: { draftId: { equals: draft.id } },
        depth: 0,
      })
    ).docs;
    const before = structuredClone(formal);
    const publicRows = await listPublicPolicies(p, "en");
    assert.ok(publicRows.some((row) => row.maxStayHours === 144));
    const match = queryImmigrationPolicies(
      { nationalityISO: "XY", arrivalDate: "2026-01-01" },
      publicRows,
      { verifiedOnOrBefore: "2026-11-08", visaGuide: null },
    ).matches;
    assert.ok(match.some((row) => row.stay.unit === "hours" && row.stay.maximum === 144));
    draft = await mutateContent(p, editor, {
      action: "save",
      id: draft.id,
      revision: draft.revision,
      body: draft.body,
      policy: { internalNotes: "partial hour update" },
    });
    assert.equal(
      (await p.findByID({ collection: "immigration-policies", id: ref.id })).maxStayHours,
      144,
    );
    assert.deepEqual(
      (
        await p.find({
          collection: "content-published",
          where: { draftId: { equals: draft.id } },
          depth: 0,
        })
      ).docs,
      before,
    );
    draft = await mutateContent(p, editor, {
      action: "save",
      id: draft.id,
      revision: draft.revision,
      body: draft.body,
      policy: { maxStayHours: null, maxStayDays: 3 },
    });
    const legacy = await readPolicyEditor(p, editor, draft.id);
    assert.equal(legacy.policy.maxStayHours, null);
    assert.equal(legacy.policy.maxStayDays, 3);
    draft = await mutateContent(p, editor, {
      action: "save",
      id: draft.id,
      revision: draft.revision,
      body: draft.body,
      policy: { internalNotes: "legacy partial" },
    });
    const preserved = await p.findByID({ collection: "immigration-policies", id: ref.id });
    assert.equal(preserved.maxStayDays, 3);
    assert.equal(preserved.maxStayHours, null);
    const version = (
      await p.findVersions({
        collection: "content-drafts",
        where: {
          and: [{ parent: { equals: draft.id } }, { "version.revision": { equals: 1 } }],
        },
        limit: 1,
      })
    ).docs[0];
    draft = await mutateContent(p, editor, {
      action: "restore",
      id: draft.id,
      revision: draft.revision,
      versionId: version.id,
    });
    assert.equal(
      (await p.findByID({ collection: "immigration-policies", id: ref.id })).maxStayHours,
      144,
    );
    console.log(
      "PASS hours save/partial/restore, port submit guard, second review, formal snapshot/query unchanged by working edits",
    );
  });
} finally {
  await p.destroy();
}

process.exit(0);
