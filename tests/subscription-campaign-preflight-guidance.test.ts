import assert from "node:assert/strict";
import { test } from "node:test";
import { preflightActionHint } from "../src/lib/subscription-campaign-revision-preflight.ts";

const revised = {
  snapshot: { current: false },
  blockers: [] as string[],
  asOf: "2030-01-01T00:00:01.000Z",
};
const newerControl = "2030-01-01T00:00:02.000Z";
const cases = [
  [
    "no original snapshot",
    { snapshot: null, blockers: ["no-snapshot"] },
    {},
    /先保存、模拟确认并冻结原名单/,
    /本地续发入口勾选/,
  ],
  [
    "still original version",
    { snapshot: { current: true }, blockers: ["not-revised"] },
    {},
    /原冻结版本.*无须改版续发/,
    /勾选确认/,
  ],
  ["already saved", revised, { continued: true }, /本版续发范围已保存.*不会补入或扩大/, /勾选确认/],
  ["saved with dirty choices", revised, { continued: true, dirty: true }, /范围已保存/, /勾选确认/],
  ["dirty revised choices", revised, { dirty: true }, /先保存当前选择.*重新模拟并确认/, /可在上方/],
  ["another operation pending", revised, { blocked: true }, /先完成当前操作或核实结果/, /可在上方/],
  [
    "source blocker",
    { ...revised, blockers: ["source-changed"] },
    {},
    /先处理下方阻断/,
    /可在上方/,
  ],
  ["active lease", { ...revised, blockers: ["active-lease"] }, {}, /先处理下方阻断/, /可在上方/],
  [
    "paused saved range",
    { ...revised, blockers: ["paused"] },
    { continued: true },
    /已暂停.*恢复/,
    /可在上方/,
  ],
  [
    "cancelled saved range",
    { ...revised, blockers: ["cancelled"] },
    { continued: true },
    /已取消.*不能.*续发/,
    /勾选确认/,
  ],
  [
    "live pause before report refresh",
    revised,
    { paused: true, controlChangedAt: newerControl },
    /已暂停.*恢复/,
    /可在上方/,
  ],
  [
    "live cancellation before report refresh",
    revised,
    { cancelled: true },
    /已取消.*不能.*续发/,
    /可在上方/,
  ],
  [
    "live resume with old paused report",
    { ...revised, blockers: ["paused"] },
    { paused: false, controlChangedAt: newerControl },
    /已恢复.*刷新预检/,
    /活动已暂停/,
  ],
  [
    "no eligible candidates",
    { ...revised, counts: { candidates: 0 } },
    {},
    /本次预检没有可续发候选/,
    /可在上方/,
  ],
  [
    "ready but no loaded receipt",
    revised,
    {},
    /当前页尚未载入.*入口勾选确认.*核实保存状态与资格/,
    /本版尚未保存/,
  ],
] as const;
for (const [name, report, options, expected, absent] of cases)
  test("preflight action matches " + name, () => {
    const hint = preflightActionHint(report, options);
    assert.match(hint, expected);
    assert.doesNotMatch(hint, absent);
    assert.doesNotMatch(hint, /清除|强制重试|发送真实邮件/);
  });

test("newer paused report cannot be overwritten by an older running control", () => {
  const hint = preflightActionHint(
    { ...revised, blockers: ["paused"] },
    { paused: false, controlChangedAt: "2030-01-01T00:00:00.000Z" },
  );
  assert.match(hint, /本次预检显示活动已暂停.*重新打开活动核实/);
  assert.doesNotMatch(hint, /活动已恢复|可在上方/);
});

test("newer running report cannot be overwritten by an older paused control", () => {
  const hint = preflightActionHint(revised, {
    paused: true,
    controlChangedAt: "2030-01-01T00:00:00.000Z",
  });
  assert.match(hint, /本次预检未见暂停标记.*重新打开活动核实/);
  assert.doesNotMatch(hint, /活动已暂停|可在上方/);
});

test("conflicting control without a later timestamp requires verification", () => {
  for (const controlChangedAt of [null, "invalid", revised.asOf]) {
    const hint = preflightActionHint(
      { ...revised, blockers: ["paused"] },
      { paused: false, controlChangedAt },
    );
    assert.match(hint, /控制状态不一致.*重新打开活动核实/);
    assert.doesNotMatch(hint, /活动已恢复|可在上方/);
  }
});

test("a refreshed passing report does not unlock an unavailable page entry", () => {
  const hint = preflightActionHint({ ...revised, counts: { candidates: 3 } }, { available: false });
  assert.match(hint, /本页续发入口仍未就绪.*未保存选择.*重新打开活动/);
  assert.doesNotMatch(hint, /入口勾选确认/);
});
