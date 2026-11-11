import assert from "node:assert/strict";
import { test } from "node:test";
import {
  filterPolicyBannerChoices,
  newPolicyBannerKeys,
  policyBannerChoice,
} from "../src/lib/policy-banner-picker.ts";
import type { Block } from "../src/lib/content-model.ts";

const policy = {
  countryCode: "XY",
  countryNameZh: "虚构星桥",
  countryNameEn: "Fictional Starbridge",
  policyType: "transit-240h" as const,
  validFrom: "2026-11-10",
  validUntil: "2026-12-10",
  verifiedBy: 97,
  internalNotes: "private",
  publicNotes: "not needed in this selector",
  officialSourceUrl: "https://example.invalid/",
};
const choice = policyBannerChoice("fictional-starbridge-transit", policy);

test("picker projection exposes only identification fields", () => {
  assert.deepEqual(choice, {
    key: "fictional-starbridge-transit",
    countryCode: "XY",
    countryNameZh: "虚构星桥",
    countryNameEn: "Fictional Starbridge",
    policyType: "transit-240h",
    validFrom: "2026-11-10",
    validUntil: "2026-12-10",
  });
});

test("search finds Chinese and English names, codes and policy labels", () => {
  for (const query of ["虚构", "starbridge", "xy", "ＸＹ", "240小时", "Starbridge transit", "  "])
    assert.deepEqual(filterPolicyBannerChoices([choice], query), [choice]);
  assert.deepEqual(filterPolicyBannerChoices([choice], "not a match"), []);
});

test("existing references can move or toggle status, while added copies require verification", () => {
  const old: Block = { type: "policy-banner", text: "retired" };
  const text: Block = { type: "paragraph", text: "retired" };
  const replacement: Block = { type: "policy-banner", text: "replacement" };
  assert.deepEqual(
    newPolicyBannerKeys([old, text], [text, { ...old, policyUnconfirmed: true }]),
    [],
  );
  assert.deepEqual(newPolicyBannerKeys([old], [old, old, replacement, replacement]), [
    "retired",
    "replacement",
  ]);
  assert.deepEqual(newPolicyBannerKeys([old], []), []);
});
