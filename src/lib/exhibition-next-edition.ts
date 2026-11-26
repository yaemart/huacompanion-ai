import type { ContentBody } from "./content-model.ts";
import type { Exhibition } from "./exhibitions.ts";
import { effectiveExhibitionStatus, shanghaiToday, validExhibitionDate } from "./exhibitions.ts";
import { StaffFormError } from "./staff-form-feedback.ts";

export type ExhibitionEdition = Pick<
  ContentBody,
  "kind" | "locale" | "contentKey" | "title" | "slug" | "calendarExportable"
> & {
  exhibition?: Pick<Exhibition, "startDate" | "endDate" | "status" | "nextEditionKey">;
};

export function isNextEditionTarget(
  source: ExhibitionEdition,
  target: ExhibitionEdition,
  today = shanghaiToday(),
): boolean {
  const from = source.exhibition;
  const to = target.exhibition;
  if (
    source.kind !== "exhibition" ||
    !from ||
    target.kind !== "exhibition" ||
    !to ||
    source.locale !== target.locale ||
    source.contentKey === target.contentKey ||
    !["announced", "pending", "postponed"].includes(effectiveExhibitionStatus(to, today))
  )
    return false;
  if (from.endDate && !validExhibitionDate(from.endDate)) return false;
  if (!to.startDate && !to.endDate) return ["pending", "postponed"].includes(to.status);
  return (
    validExhibitionDate(to.startDate) &&
    validExhibitionDate(to.endDate) &&
    to.startDate <= to.endDate &&
    (!from.endDate || to.startDate > from.endDate)
  );
}

export function resolveNextEdition(
  source: ExhibitionEdition,
  published: ExhibitionEdition[],
  today = shanghaiToday(),
): ExhibitionEdition | undefined {
  const e = source.exhibition;
  // A past pending snapshot can look ended; retain its original unconfirmed qualification.
  if (
    !e?.nextEditionKey ||
    source.calendarExportable === false ||
    !["announced", "ended"].includes(e.status) ||
    !validExhibitionDate(e.startDate) ||
    e.startDate > e.endDate ||
    !validExhibitionDate(e.endDate) ||
    e.endDate >= today
  )
    return undefined;
  return published.find(
    (target) =>
      target.contentKey === e.nextEditionKey && isNextEditionTarget(source, target, today),
  );
}

export function validateNextEditionPublication(
  source: ExhibitionEdition,
  published: ExhibitionEdition[],
): void {
  const key = source.exhibition?.nextEditionKey;
  if (!key) return;
  const target = published.find((d) => d.contentKey === key && isNextEditionTarget(source, d));
  if (!target)
    throw new StaffFormError(
      "下一届须为当前语言已公开、未取消或结束的其他展会，已知日期须晚于本届结束；请重新选择或清空。",
    );
  const byKey = new Map(
    published
      .filter((d) => d.kind === "exhibition" && d.locale === source.locale)
      .map((d) => [d.contentKey, d]),
  );
  const visited = new Set([source.contentKey]);
  let currentKey: string | undefined = target.contentKey;
  while (currentKey) {
    if (visited.has(currentKey))
      throw new StaffFormError("下一届展会关系存在回环，请检查关联后重新提交审核。");
    visited.add(currentKey);
    currentKey = byKey.get(currentKey)?.exhibition?.nextEditionKey;
  }
}
