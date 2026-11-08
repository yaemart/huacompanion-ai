import type { ContentDraft, ImmigrationPolicy } from "../../payload-types.ts";
import { isPolicyCalendarDate } from "./immigration-policy.ts";
import type { ContentBody } from "./content-model.ts";

export const policyStateLabels = {
  draft: "草稿",
  review: "待审核",
  returned: "已退回",
  approved: "已审核快照",
};
export const policyTypeLabels = {
  unilateral: "单方面免签",
  bilateral: "互免",
  "transit-240h": "240小时过境",
  other: "其他",
};
export type PolicyListRow = Pick<ContentDraft, "id" | "title" | "locale" | "reviewState"> & {
  country: string | null;
  policyType: ImmigrationPolicy["policyType"];
  validUntil: string | null;
  lastVerifiedOn: string | null;
};
export type PolicyListSort =
  "country" | "policyType" | "reviewState" | "validUntil" | "lastVerifiedOn";
export type PolicyListFilter = "all" | "review" | "returned" | "expiring";

export function policyVerificationDefaults(userId: number, now: Date) {
  return {
    verifiedBy: userId,
    lastVerifiedOn: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(now),
  };
}
export function policyListRow(
  draft: Pick<ContentDraft, "id" | "identity" | "title" | "locale" | "reviewState" | "body">,
  record?: Pick<
    ImmigrationPolicy,
    | "id"
    | "policyKey"
    | "revision"
    | "countryNameZh"
    | "countryNameEn"
    | "countryCode"
    | "policyType"
    | "validUntil"
    | "lastVerifiedOn"
  >,
): PolicyListRow {
  const ref = (draft.body as unknown as ContentBody)?.policyRef;
  const facts =
    ref &&
    record?.id === ref.id &&
    record?.revision === ref.revision &&
    record?.policyKey === draft.identity
      ? record
      : undefined;
  return {
    id: draft.id,
    title: draft.title,
    locale: draft.locale,
    reviewState: draft.reviewState,
    country: facts?.countryNameZh || facts?.countryNameEn || facts?.countryCode || null,
    policyType: facts?.policyType ?? null,
    validUntil: facts?.validUntil ?? null,
    lastVerifiedOn: facts?.lastVerifiedOn ?? null,
  };
}
export function filterPolicyRows(
  rows: readonly PolicyListRow[],
  filter: PolicyListFilter,
  today: string,
) {
  if (filter === "all") return [...rows];
  if (filter !== "expiring") return rows.filter((row) => row.reviewState === filter);
  if (!isPolicyCalendarDate(today)) throw Error("中国日期基准无效");
  const end = new Date(`${today}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 30);
  const until = end.toISOString().slice(0, 10);
  return rows.filter(
    (row) =>
      isPolicyCalendarDate(row.validUntil) && row.validUntil >= today && row.validUntil <= until,
  );
}
export function sortPolicyRows(
  rows: readonly PolicyListRow[],
  key: PolicyListSort,
  direction: "asc" | "desc",
) {
  const value = (row: PolicyListRow) =>
    key === "policyType"
      ? row.policyType && policyTypeLabels[row.policyType]
      : key === "reviewState"
        ? policyStateLabels[row.reviewState]
        : row[key];
  return [...rows].sort((a, b) => {
    const left = value(a),
      right = value(b);
    if (!left || !right) return left ? -1 : right ? 1 : a.id - b.id;
    const order =
      key === "validUntil" || key === "lastVerifiedOn"
        ? left < right
          ? -1
          : left > right
            ? 1
            : 0
        : left.localeCompare(right, "zh-CN");
    return order * (direction === "asc" ? 1 : -1) || a.id - b.id;
  });
}
