export type ProviderReviewStatus = "verified" | "contracted" | "paused";
export const providerReviewLabels = { verified: "核实通过", contracted: "签约", paused: "暂停" };
export function providerReviewInput(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw Error("审核内容无效");
  const d = input as Record<string, unknown>;
  if (
    !["number", "string"].includes(typeof d.id) ||
    !/^[1-9]\d*$/.test(String(d.id)) ||
    !Number.isSafeInteger(Number(d.id))
  )
    throw Error("服务商编号无效");
  if (typeof d.status !== "string" || !Object.hasOwn(providerReviewLabels, d.status))
    throw Error("请选择核实通过、签约或暂停");
  if (typeof d.reason !== "string" || !d.reason.trim() || d.reason.trim().length > 2000)
    throw Error("请填写审核原因，最多2000字");
  if (typeof d.key !== "string" || !/^[a-f0-9-]{36}$/i.test(d.key))
    throw Error("提交编号无效，请重试");
  if (
    typeof d.updatedAt !== "string" ||
    d.updatedAt.length > 60 ||
    !Number.isFinite(Date.parse(d.updatedAt))
  )
    throw Error("资料版本无效，请刷新后重试");
  return {
    id: Number(d.id),
    status: d.status as ProviderReviewStatus,
    reason: d.reason.trim(),
    key: d.key,
    updatedAt: new Date(d.updatedAt).toISOString(),
  };
}
