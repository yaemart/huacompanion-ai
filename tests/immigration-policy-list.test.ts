import { test } from "node:test";
import assert from "node:assert/strict";
import {
  policyListRow,
  policyVerificationDefaults,
  filterPolicyRows,
  sortPolicyRows,
  type PolicyListRow,
} from "../src/lib/immigration-policy-list.ts";
import type { ContentDraft, ImmigrationPolicy } from "../payload-types.ts";
const row = (id: number, fields: Partial<PolicyListRow> = {}): PolicyListRow => ({
  id,
  title: "演示政策",
  locale: "zh",
  country: "虚构国家",
  policyType: "unilateral",
  reviewState: "draft",
  validUntil: null,
  lastVerifiedOn: null,
  ...fields,
});
test("verification defaults use the authenticated actor and China date across UTC midnight", () => {
  assert.deepEqual(policyVerificationDefaults(8, new Date("2026-11-08T16:01:00Z")), {
    verifiedBy: 8,
    lastVerifiedOn: "2026-11-09",
  });
  assert.equal(
    policyVerificationDefaults(7, new Date("2026-11-08T15:59:00Z")).lastVerifiedOn,
    "2026-11-08",
  );
});
test("list projection follows exact policy identity and revision without leaking internal fields", () => {
  const draft = {
    id: 1,
    identity: "test:zh",
    title: "演示",
    locale: "zh",
    reviewState: "review",
    body: { policyRef: { id: 3, revision: 2 } },
  } satisfies Pick<ContentDraft, "id" | "identity" | "title" | "locale" | "reviewState" | "body">;
  const record = {
    id: 3,
    revision: 2,
    policyKey: "test:zh",
    countryNameZh: "虚构国家",
    countryCode: "XY",
    policyType: "unilateral",
    validUntil: "2026-12-31",
    lastVerifiedOn: "2026-11-08",
    internalNotes: "secret",
    verifiedBy: 9,
  } as ImmigrationPolicy;
  const result = policyListRow(draft, record);
  assert.deepEqual(
    Object.keys(result).sort(),
    [
      "id",
      "title",
      "locale",
      "country",
      "policyType",
      "reviewState",
      "validUntil",
      "lastVerifiedOn",
    ].sort(),
  );
  assert.equal(result.country, "虚构国家");
  assert.ok(!JSON.stringify(result).includes("secret"));
  for (const invalid of [
    { ...record, revision: 4 },
    { ...record, id: 8 },
    { ...record, policyKey: "other:zh" },
    undefined,
  ]) {
    assert.equal(policyListRow(draft, invalid).country, null);
    assert.equal(policyListRow(draft, invalid).validUntil, null);
  }
});
test("review and return filters show only matching work drafts", () => {
  const rows = [row(1), row(2, { reviewState: "review" }), row(3, { reviewState: "returned" })];
  assert.deepEqual(
    filterPolicyRows(rows, "review", "2026-11-08").map((r) => r.id),
    [2],
  );
  assert.deepEqual(
    filterPolicyRows(rows, "returned", "2026-11-08").map((r) => r.id),
    [3],
  );
  assert.equal(filterPolicyRows(rows, "all", "2026-11-08").length, 3);
});
test("expiry filter includes today and day 30, excludes expired, day 31, absent and invalid dates", () => {
  const rows = [
    row(1, { validUntil: "2026-11-07" }),
    row(2, { validUntil: "2026-11-08" }),
    row(3, { validUntil: "2026-12-08" }),
    row(4, { validUntil: "2026-12-09" }),
    row(5),
    row(6, { validUntil: "2026-11-31" }),
  ];
  assert.deepEqual(
    filterPolicyRows(rows, "expiring", "2026-11-08").map((r) => r.id),
    [2, 3],
  );
  assert.deepEqual(
    filterPolicyRows([row(7, { validUntil: "2027-01-05" })], "expiring", "2026-12-20").map(
      (r) => r.id,
    ),
    [7],
  );
});
test("all five columns sort both directions with missing values last and stable id ties", () => {
  for (const key of [
    "country",
    "policyType",
    "reviewState",
    "validUntil",
    "lastVerifiedOn",
  ] as const) {
    const values =
      key === "country"
        ? ["德国", "美国"]
        : key === "policyType"
          ? ["unilateral", "bilateral"]
          : key === "reviewState"
            ? ["draft", "review"]
            : ["2026-11-01", "2026-12-01"];
    const rows = [
      row(3, { [key]: values[1] }),
      row(2, { [key]: values[0] }),
      row(1, { [key]: values[0] }),
    ];
    const asc = sortPolicyRows(rows, key, "asc");
    const desc = sortPolicyRows(rows, key, "desc");
    assert.deepEqual(
      asc.map((r) => r.id),
      [1, 2, 3],
      key,
    );
    assert.deepEqual(
      desc.map((r) => r.id),
      [3, 1, 2],
      key,
    );
    assert.deepEqual(
      rows.map((r) => r.id),
      [3, 2, 1],
    );
  }
  for (const key of ["country", "policyType", "validUntil", "lastVerifiedOn"] as const) {
    const rows = [
      row(1, { [key]: null }),
      row(2, { [key]: key === "policyType" ? "bilateral" : "2026-12-01" }),
    ];
    for (const direction of ["asc", "desc"] as const)
      assert.equal(sortPolicyRows(rows, key, direction).at(-1)?.id, 1);
  }
});
