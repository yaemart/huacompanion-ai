import assert from "node:assert/strict";
import test from "node:test";
import {
  policyCountryOptions,
  selectPolicyVisaGuide,
} from "../src/lib/immigration-policy-browser.ts";
import type { ContentBody } from "../src/lib/content-model.ts";
import { queryPolicy } from "./helpers/policy-query-fixture.ts";

const asOf = "2026-11-01";
const guide = (overrides: Partial<ContentBody> = {}): ContentBody => ({
  contentKey: "fixture-visa-guide",
  kind: "guide",
  locale: "en",
  slug: "fictional-visa",
  title: "Fictional visa guide",
  blocks: [],
  sources: [],
  ...overrides,
});

test("browser countries deduplicate ISO codes and include expired/future formal records", () => {
  const policies = [
    queryPolicy({ countryCode: "ZZ", validFrom: "2027-01-01", validUntil: null }),
    queryPolicy({ countryCode: "AA", validUntil: "2026-01-02" }),
    queryPolicy({ countryCode: "AA", policyType: "transit-240h" }),
  ];
  assert.deepEqual(policyCountryOptions(policies, asOf, "en"), [
    { value: "AA", label: "Fictional country (AA)" },
    { value: "ZZ", label: "Fictional country (ZZ)" },
  ]);
  assert.equal(policyCountryOptions(policies, asOf, "zh")[0].label, "虚构国家 (AA)");
});

test("country options exclude corrupt/private rows and do not mutate frozen inputs", () => {
  const policy = queryPolicy();
  Object.freeze(policy.portsAndRegions);
  Object.freeze(policy);
  const options = policyCountryOptions(
    Object.freeze([
      policy,
      { ...queryPolicy(), countryCode: "ZZ", internalNotes: "private" },
      null,
    ]),
    asOf,
    "en",
  );
  assert.equal(options.length, 1);
  options[0].label = "Changed";
  assert.equal(policyCountryOptions([policy], asOf, "en")[0].label, "Fictional country (XY)");
  assert.deepEqual(policyCountryOptions([], asOf, "en"), []);
});

test("guide selection requires an explicit unique published identity in the current language", () => {
  const docs = [
    guide(),
    guide({ contentKey: "another", slug: "another" }),
    guide({ locale: "zh", title: "虚构签证指引" }),
  ];
  for (const key of [undefined, "", " ", "missing"])
    assert.equal(selectPolicyVisaGuide(docs, "en", key), null);
  assert.deepEqual(selectPolicyVisaGuide(docs, "en", "fixture-visa-guide"), {
    href: "/en/guides/fictional-visa",
    title: "Fictional visa guide",
  });
  assert.deepEqual(selectPolicyVisaGuide(docs, "zh", "fixture-visa-guide"), {
    href: "/zh/guides/fictional-visa",
    title: "虚构签证指引",
  });
  assert.equal(
    selectPolicyVisaGuide([guide({ kind: "service" })], "en", "fixture-visa-guide"),
    null,
  );
  assert.equal(selectPolicyVisaGuide([guide()], "zh", "fixture-visa-guide"), null);
  assert.equal(selectPolicyVisaGuide([guide(), guide()], "en", "fixture-visa-guide"), null);
});

test("guide reference rejects unsafe slugs/titles and contains only detached public fields", () => {
  for (const row of [
    guide({ slug: "../private" }),
    guide({ slug: "javascript:bad" }),
    guide({ slug: "visa?query=bad" }),
    guide({ title: " " }),
    guide({ title: "x".repeat(201) }),
  ])
    assert.equal(selectPolicyVisaGuide([row], "en", row.contentKey), null);
  const row = Object.freeze(Object.assign(guide(), { internalNotes: "Secret" }));
  const result = selectPolicyVisaGuide([row], "en", row.contentKey);
  assert.deepEqual(result, { href: "/en/guides/fictional-visa", title: "Fictional visa guide" });
  if (result) result.title = "Changed";
  assert.equal(row.title, "Fictional visa guide");
});
