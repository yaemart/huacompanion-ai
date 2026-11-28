import type { OwnerDisplay } from "./crm-overview.ts";
export function ownerLabel(owner: OwnerDisplay): string {
  if (owner.state === "valid") return owner.name || "负责人当前不可用";
  const label =
    owner.state === "inactive"
      ? "待分派（负责人已停用）"
      : owner.state === "ineligible"
        ? "待分派（负责人资格变化）"
        : "待分派";
  return owner.name ? `${label} · ${owner.name}` : label;
}
export function followUpLabel(value: string | null): string {
  if (!value) return "未填写跟进日期";
  const n = Date.parse(value);
  return Number.isFinite(n)
    ? new Date(n + 8 * 3600000).toISOString().slice(0, 16).replace("T", " ") + "（北京时间）"
    : "时间资料异常，请联系管理员";
}
