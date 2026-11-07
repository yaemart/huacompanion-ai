import { test } from "node:test";
import assert from "node:assert/strict";
import { canAccessContentKind } from "../src/cms/access.ts";
import { validateContent, publicBody, type ContentBody } from "../src/lib/content-model.ts";

const body = {
  contentKey: "fictional-policy",
  slug: "fictional-policy",
  kind: "immigration-policy",
  locale: "en",
  title: "Fictional policy",
  blocks: [],
  sources: [],
};
test("policy drafts use a separate authorized content kind", () => {
  assert.doesNotThrow(() => validateContent(body));
  assert.equal(
    canAccessContentKind({ id: 1, role: "editor", contentKinds: ["guide"] }, body.kind),
    false,
  );
  assert.equal(
    canAccessContentKind({ id: 1, role: "editor", contentKinds: [body.kind] }, body.kind),
    true,
  );
  assert.equal(
    canAccessContentKind(
      { id: 1, role: "editor", active: false, contentKinds: [body.kind] },
      body.kind,
    ),
    false,
  );
});
test("policy snapshot projection cannot expose record references or verification identity", () => {
  const projected = publicBody({
    ...body,
    policyRef: { id: 42, revision: 3 },
    policy: {
      countryCode: "XY",
      countryNameEn: "Fictional",
      countryNameZh: "虚构",
      policyType: "other",
      maxStayDays: 3,
      validFrom: "2026-01-01",
      validUntil: null,
      portsAndRegions: [],
      officialSourceUrl: "https://example.invalid/fiction",
      lastVerifiedOn: "2026-01-01",
      publicNotes: "Fiction",
      verifiedBy: 71,
      internalNotes: "Private",
      extra: "Never public",
    },
  } as unknown as ContentBody);
  assert.equal(projected.policy?.countryCode, "XY");
  assert.ok(!JSON.stringify(projected).includes('"policyRef"'));
  for (const hidden of ["verifiedBy", "internalNotes", "extra"])
    assert.ok(!JSON.stringify(projected).includes(hidden));
});

test("partial policy edits reject workflow fields and expanded staff objects", async () => {
  const { policyDraft } = await import("../src/lib/immigration-policy-draft.ts");
  assert.deepEqual(
    policyDraft({ countryNameZh: "待核实", portsAndRegions: ["条件"], verifiedBy: null }),
    { countryNameZh: "待核实", portsAndRegions: [{ label: "条件" }], verifiedBy: null },
  );
  for (const data of [
    { status: "published" },
    { revision: 99 },
    { id: 2 },
    { verifiedBy: { id: 2 } },
    { portsAndRegions: [{}] },
    { maxStayDays: 1.5 },
    { publicNotes: "x".repeat(4001) },
  ])
    assert.throws(() => policyDraft(data));
});
