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
