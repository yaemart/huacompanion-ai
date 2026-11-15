import test from "node:test";
import assert from "node:assert/strict";
import {
  StaffFormError,
  staffFormMessage,
  readStaffFormResponse,
  staffFieldIssue,
} from "../src/lib/staff-form-feedback.ts";
import { validateContent } from "../src/lib/content-model.ts";
import { validatePolicyPublication } from "../src/lib/immigration-policy.ts";
import { validateQuote } from "../src/lib/business.ts";

test("form messages expose only explicit feedback and handle a broken response", async () => {
  const fallback = "请保留当前填写，稍后重试。";
  const unexpected = "SELECT * FROM private_table";
  assert.equal(staffFormMessage(Error(unexpected), fallback), fallback);
  assert.equal(
    staffFormMessage(new StaffFormError("请填写服务单名称"), fallback),
    "请填写服务单名称",
  );
  await assert.rejects(
    readStaffFormResponse(new Response("<html>timeout</html>", { status: 504 }), fallback),
    { message: fallback },
  );
  await assert.rejects(
    readStaffFormResponse(Response.json({ error: unexpected }, { status: 500 }), fallback),
    { message: fallback },
  );
  await assert.rejects(
    readStaffFormResponse(Response.json({ error: "请选资料来源" }, { status: 400 }), fallback),
    { message: "请选资料来源" },
  );
});

test("native quote number validation describes how to fix the same field", () => {
  assert.match(
    staffFieldIssue("第 2 项费用的单价", { stepMismatch: true }, "0", "", "0.01"),
    /第 2 项.*单价.*两位小数/,
  );
  assert.match(
    staffFieldIssue("第 2 项费用的数量", { rangeUnderflow: true }, "1", "10000", "1"),
    /数量.*至少.*1/,
  );
  assert.match(
    staffFieldIssue("变更与取消规则", { valueMissing: true }, "", "", ""),
    /填写.*变更与取消规则/,
  );
});

test("guide validation names the source number and points to an example URL", () => {
  const doc = {
    kind: "guide",
    locale: "zh",
    contentKey: "guide-sample",
    slug: "guide-sample",
    title: "演示指南",
    sources: [
      { id: "one", title: "来源一", url: "https://example.invalid" },
      { id: "two", title: "来源二", url: "example.invalid" },
    ],
    blocks: [],
  };
  assert.throws(
    () => validateContent(doc),
    (error) =>
      error instanceof StaffFormError && /资料来源.*第 2 条.*网址.*https/.test(error.message),
  );
});

test("policy publication names how to correct the official source and the cutoff date", () => {
  const policy = {
    countryCode: "XY",
    countryNameEn: "Fictional",
    countryNameZh: "虚构",
    policyType: "transit-240h",
    maxStayHours: 240,
    validFrom: "2026-11-05",
    lastVerifiedOn: "2026-11-05",
    portsAndRegions: ["虚构口岸"],
    officialSourceUrl: "http://example.invalid",
    verifiedBy: 1,
    publicNotes: "",
  };
  assert.throws(
    () => validatePolicyPublication(policy, "2026-11-15"),
    (error) => error instanceof StaffFormError && /官方来源链接.*https:\/\//.test(error.message),
  );
  assert.throws(
    () => validatePolicyPublication({ ...policy, validUntil: "2026-11-01" }, "2026-11-15"),
    /截止日.*生效日.*留空/,
  );
});

test("quote field failures tell staff which line or term to fix", () => {
  const quote = {
    title: "演示",
    scope: "服务",
    included: "陪同",
    excluded: "交通",
    terms: "提前联系",
    currency: "CNY",
    expiresAt: "2026-12-01T09:00",
    lines: [
      { label: "陪同", quantity: 1, unitMinor: 100 },
      { label: "交通", quantity: 0, unitMinor: 100 },
    ],
  };
  const now = Date.parse("2026-11-15T00:00:00Z");
  assert.throws(() => validateQuote(quote, now), /第 2 项.*数量.*1.*10,000/);
  assert.throws(() => validateQuote({ ...quote, terms: " " }, now), /填写.*变更与取消规则/);
  assert.throws(
    () => validateQuote({ ...quote, expiresAt: "2026-11-14T09:00" }, now),
    /有效期.*北京时间.*以后/,
  );
});
