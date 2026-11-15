import assert from "node:assert/strict";
import test from "node:test";
import { monthlyPerformanceCsv } from "../src/lib/staff-monthly-csv.ts";
import { defaultScorecardRules, observeMetric } from "../src/lib/staff-scorecard.ts";

const rule = defaultScorecardRules().templates.operations.complaints;
const report = {
  period: {
    month: "2031-02",
    current: "2031-03",
    start: "2031-01-31T16:00:00Z",
    end: "2031-02-28T16:00:00Z",
    through: "2031-02-28T16:00:00Z",
  },
  staff: 12,
  name: '  =WEBSERVICE("fictional")',
  asOf: "2031-03-01T00:30:45.123Z",
  response: { minutes: null, samples: 0 },
  followup: { due: 5, onTime: 4 },
  incidents: { complaints: 0, corrections: 1 },
  pending: [
    { id: 31, source: "case", reason: "confirmation" },
    { id: 32, source: "fact", reason: "window" },
    { id: 33, source: "note", reason: "review" },
  ] as const,
  review: { decisions: 2, returned: 1, samples: 1, minutes: 45 },
  overdueReviews: 0,
  scorecard: {
    mode: "trial" as const,
    template: "operations" as const,
    version: "1",
    metrics: [observeMetric("complaints", rule, { value: 0, samples: 1, pending: 1 })],
    corrections: [{ id: 41, result: "upheld" as const, at: "2031-03-01T00:00:00.000Z" }],
  },
};

test("monthly CSV uses Beijing cutoff, BOM and fixed observation-only projection", () => {
  const fixture = { ...report, privateEvidence: "INTERNAL-FIXTURE" };
  const { csv, count } = monthlyPerformanceCsv([fixture]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.match(csv, /统计截至时间（北京时间）/);
  assert.equal((csv.match(/2031-03-01 08:30:45\.123\+08:00/g) || []).length, count);
  assert.match(csv, /"' {2}=WEBSERVICE\(""fictional""\)"/);
  assert.match(csv, /试行观察/);
  assert.match(csv, /个人有效投诉数","待定"/);
  assert.match(csv, /待定记录","服务投诉","待确认"/);
  assert.match(csv, /待定记录","政策事实纠错","申诉期内"/);
  assert.match(csv, /待定记录","政策说明纠错","申诉待复核"/);
  assert.match(csv, /复核更新","申诉复核","维持判定"/);
  assert.doesNotMatch(csv, /INTERNAL-FIXTURE|总分|扣分|内部联系方式/);
  assert.equal(count, 12);
});
