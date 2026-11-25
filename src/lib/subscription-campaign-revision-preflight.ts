export const preflightCounts = {
  attempted: "已尝试或完成，保留历史",
  cancelled: "已取消，保留终态",
  ineligible: "当前资格不符",
  leased: "领取中，尚未开始",
  candidates: "从未尝试且资格有效的候选",
};
export const preflightBlockers = {
  "no-snapshot": "尚未冻结原名单，无法评估改版续发。",
  "not-revised": "当前草稿仍是冻结版本，尚未改版。",
  "source-changed": "来源已失效或变化，请重新选择政策并保存草稿。",
  "confirmation-required": "当前版本尚无有效模拟确认，请重新测试并逐语言确认。",
  paused: "活动已暂停，预检不会恢复活动。",
  cancelled: "活动已永久取消，不能恢复或续发。",
  "active-lease": "原名单仍有有效领取，请等待处理结束后重新预检。",
};

export function preflightActionHint(
  report: {
    snapshot: { current: boolean } | null;
    blockers: readonly string[];
    counts?: { candidates: number };
    asOf?: string;
  },
  {
    continued = false,
    dirty = false,
    blocked = false,
    paused,
    cancelled,
    controlChangedAt,
    available = true,
  }: {
    continued?: boolean;
    dirty?: boolean;
    blocked?: boolean;
    paused?: boolean;
    cancelled?: boolean;
    controlChangedAt?: string | null;
    available?: boolean;
  } = {},
) {
  if (cancelled || report.blockers.includes("cancelled"))
    return "活动已取消，仅能查阅已有记录，不能继续续发。";
  const reportPaused = report.blockers.includes("paused");
  if (
    paused !== undefined &&
    paused !== reportPaused &&
    !(Date.parse(controlChangedAt ?? "") > Date.parse(report.asOf ?? ""))
  )
    return (
      (reportPaused ? "本次预检显示活动已暂停" : "本次预检未见暂停标记") +
      "，与本页控制状态不一致；请先记下未保存选择，再重新打开活动核实。"
    );
  if (paused ?? reportPaused)
    return "活动已暂停，请先核对本版模拟确认并恢复；预检不会恢复活动或扩展范围。";
  if (paused === false && reportPaused)
    return "活动已恢复，上一份预检仍有暂停标记，请刷新预检后再核对续发条件。";
  if (!report.snapshot) return "尚无原名单快照，请先保存、模拟确认并冻结原名单。";
  if (report.snapshot.current)
    return "当前仍是原冻结版本，无须改版续发；原任务继续按既有条件处理。";
  if (continued) return "本版续发范围已保存，请查看上方收据；预检不会补入或扩大已保存范围。";
  if (dirty) return "请先保存当前选择，再为新版重新模拟并确认；预检仍只针对已保存版本。";
  if (blocked) return "请先完成当前操作或核实结果；预检不会代替续发确认。";
  if (report.blockers.length) return "请先处理下方阻断，再核对本版续发入口；提交时仍会重查资格。";
  if (report.counts?.candidates === 0)
    return "本次预检没有可续发候选，请核对原任务状态；不会补入新人或恢复历史。";
  if (!available)
    return "本次预检已更新，但本页续发入口仍未就绪；请先记下未保存选择，再重新打开活动核对模拟确认和控制状态。";
  return "当前页尚未载入本版续发收据，可在上方本地续发入口勾选确认；点击时仍会核实保存状态与资格。";
}
