export type ReviewAttempt = {
  state: "attempting" | "retry" | "review" | "failed" | "completed";
  attemptedAt: readonly string[];
  lastOutcome: "accepted" | "temporary" | "rate-limited" | "unknown" | "permanent" | null;
  completed: boolean;
  expires: number | null;
};
export const reviewReasons = {
  unknown: "结果不明",
  "attempt-limit": "已用尽5次尝试",
  "window-expired": "已达到首次尝试起23小时期限",
  interrupted: "尝试未结束且租约已失效",
  unspecified: "原记录未保存具体原因",
};
export const reviewOutcomes = {
  accepted: "模拟完成",
  temporary: "模拟临时失败",
  "rate-limited": "模拟限流",
  unknown: "模拟结果不明",
  permanent: "模拟永久失败",
};
export const reviewEvents = {
  "claim-mock-task": "领取任务",
  "recover-mock-task": "恢复未开始的领取",
  "begin-mock-attempt": "开始模拟尝试",
  "outcome-mock-attempt": "记录模拟结果",
  "review-mock-attempt": "转为待核对",
};
export function campaignReviewReason(task: ReviewAttempt, now: number) {
  if (task.completed || task.state === "completed" || task.state === "failed") return null;
  if (task.state === "review") return task.lastOutcome === "unknown" ? "unknown" : "unspecified";
  if (task.state === "retry" && task.attemptedAt.length >= 5) return "attempt-limit";
  if (now >= Date.parse(task.attemptedAt[0]) + 23 * 3600000) return "window-expired";
  if (task.state === "attempting" && (task.expires === null || task.expires <= now))
    return "interrupted";
  return null;
}
