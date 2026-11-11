import test from "node:test";
import assert from "node:assert/strict";
import {
  fillQuoteTerms,
  quoteTemplates,
  templatesForCategories,
} from "../src/lib/quote-templates.ts";
import { quoteLocalTime, quoteTime, quoteTimeLabel } from "../src/lib/quote-time.ts";
import { validateQuote } from "../src/lib/business.ts";

const business = {
  category: "business",
  enabled: true,
  included: " 展会翻译 ",
  excluded: "门票",
  terms: "变更须确认",
  private: "not projected",
};

test("template settings reject duplicate, unknown, blank, and oversized values", () => {
  for (const input of [
    [business, business],
    [{ ...business, category: "unknown" }],
    [{ ...business, included: " " }],
    [{ ...business, terms: "x".repeat(4001) }],
    [{ ...business, enabled: "true" }],
  ]) {
    assert.throws(() => quoteTemplates(input));
  }
  assert.deepEqual(quoteTemplates(undefined), []);
});

test("only matching enabled templates and allowed fields are returned", () => {
  const records = quoteTemplates([
    business,
    { ...business, category: "transport", enabled: false },
    { ...business, category: "arrival" },
    { ...business, category: "interpretation" },
  ]);
  assert.deepEqual(templatesForCategories(records, ["transport", "business", "interpretation"]), [
    { category: "business", included: "展会翻译", excluded: "门票", terms: "变更须确认" },
    { category: "interpretation", included: "展会翻译", excluded: "门票", terms: "变更须确认" },
  ]);
});

test("applying a template fills blanks and keeps entered text and money", () => {
  const input = { included: " 手填 ", excluded: " ", terms: "", total: 1234 };
  assert.deepEqual(fillQuoteTerms(input, business), {
    included: " 手填 ",
    excluded: "门票",
    terms: "变更须确认",
    total: 1234,
  });
  assert.equal(input.terms, "");
});

test("China quote time crosses a UTC date boundary and preserves explicit offsets", () => {
  const value = Date.parse("2026-11-11T16:15:00Z");
  const previousTZ = process.env.TZ;
  try {
    for (const tz of ["UTC", "America/New_York", "Asia/Shanghai"]) {
      process.env.TZ = tz;
      assert.equal(quoteTime("2026-11-12T00:15"), value);
      assert.equal(quoteTime("2026-11-11T11:15:00-05:00"), value);
      assert.equal(quoteTime("2026-11-12T00:15:00+0800"), value);
      assert.equal(quoteTime("2026-11-12T00:15:00.123456+08:00"), value + 123);
      assert.equal(quoteLocalTime("2026-11-11T16:15:00Z"), "2026-11-12T00:15");
      assert.match(quoteTimeLabel("2026-11-11T16:15:00Z", "en"), /UTC\+08:00/);
    }
  } finally {
    if (previousTZ === undefined) delete process.env.TZ;
    else process.env.TZ = previousTZ;
  }
});

test("quote expiry rejects invalid calendar dates and the exact expiry boundary", () => {
  for (const bad of ["2026-02-29T12:00", "2026-11-31T00:00Z", "2026-11-11T24:00", ""]) {
    assert.ok(Number.isNaN(quoteTime(bad)));
  }
  const data = {
    title: "Test",
    scope: "Test",
    included: "Test",
    excluded: "Test",
    terms: "Test",
    currency: "CNY",
    expiresAt: "2026-11-12T00:15",
    lines: [{ label: "Test", quantity: 1, unitMinor: 100 }],
  };
  const boundary = Date.parse("2026-11-11T16:15:00Z");
  assert.throws(() => validateQuote(data, boundary), /有效期/);
  assert.equal(validateQuote(data, boundary - 1).expiresAt, "2026-11-11T16:15:00.000Z");
});
