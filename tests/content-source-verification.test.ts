import assert from "node:assert/strict";
import { test } from "node:test";
import { prefillGuideTranslation } from "../src/lib/guide-translation.ts";
import {
  requiresSourceDates,
  sourceDateIssue,
  visaSourceKeys,
} from "../src/lib/content-source-verification.ts";

const keys = visaSourceKeys({
  VISA_GUIDE_CONTENT_KEY: " visa-guide ",
  VISA_FAQ_CONTENT_KEYS: " one, two, , one ",
});
const day = "2026-11-12";

test("uses article topic, medical section and the matching kind for configured visa links", () => {
  assert.ok(requiresSourceDates({ kind: "faq", sourceTopic: "policy" }, keys));
  assert.ok(requiresSourceDates({ kind: "guide", sourceTopic: "visa" }, keys));
  assert.ok(requiresSourceDates({ kind: "guide", category: 3 }, keys));
  assert.ok(requiresSourceDates({ kind: "guide", slug: "medical-visit-process" }, keys));
  assert.ok(requiresSourceDates({ kind: "institution", institution: { type: "medical" } }, keys));
  assert.ok(requiresSourceDates({ kind: "guide", contentKey: "visa-guide" }, keys));
  assert.ok(requiresSourceDates({ kind: "faq", contentKey: "two" }, keys));
  assert.ok(requiresSourceDates({ kind: "faq", contentKey: "faq-4" }, keys));
  assert.ok(
    requiresSourceDates({ kind: "guide", contentKey: "knowledge-verify-entry-information" }, keys),
  );
  assert.ok(requiresSourceDates({ kind: "service", category: 1, slug: "medical" }, keys));
  assert.ok(
    requiresSourceDates({ kind: "service-project", catalog: { categories: ["medical"] } }, keys),
  );
  assert.ok(!requiresSourceDates({ kind: "guide", contentKey: "two" }, keys));
  assert.ok(!requiresSourceDates({ kind: "guide", category: 1 }, keys));
  assert.ok(!requiresSourceDates({ kind: "immigration-policy", category: 1 }, keys));
});

test("checks each date, rejects impossible or future days and accepts the China calendar day", () => {
  const required = { kind: "guide", sourceTopic: "medical" as const };
  assert.match(sourceDateIssue({ ...required, sources: [] }, keys, day)!, /添加.*来源/);
  assert.match(
    sourceDateIssue({ ...required, sources: [{ checkedAt: "2026-02-30" }] }, keys, day)!,
    /有效/,
  );
  assert.match(
    sourceDateIssue({ ...required, sources: [{ checkedAt: day }, {}] }, keys, day)!,
    /第 2 条.*核实日期/,
  );
  assert.match(
    sourceDateIssue({ ...required, sources: [{ checkedAt: "2026-11-13" }] }, keys, day)!,
    /晚于今天/,
  );
  assert.equal(
    sourceDateIssue({ ...required, sources: [{ checkedAt: day }] }, keys, day),
    undefined,
  );
  assert.equal(sourceDateIssue({ kind: "guide", sources: [{}] }, keys, day), undefined);
});

test("prefills source topic when starting the other language", () => {
  assert.equal(
    prefillGuideTranslation(
      { contentKey: "visa", body: { sourceTopic: "visa", sources: [] } },
      "en",
    ).sourceTopic,
    "visa",
  );
});
