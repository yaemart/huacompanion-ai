import type { PolicyNoteDraft, PolicyNoteVersion } from "../../payload-types";
import { relationID } from "../cms/access.ts";
type NoteBody = Pick<PolicyNoteDraft, "title" | "slug" | "publicNotes">;
export function policyNoteDraft(value: unknown): Partial<NoteBody> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("说明草稿格式无效");
  const data = value as Record<string, unknown>;
  for (const [key, v] of Object.entries(data)) {
    if (!["title", "slug", "publicNotes"].includes(key) || typeof v !== "string")
      throw Error("说明只接受标题、网址标识和公开说明文本");
    if (
      (key === "title" && (!v.trim() || v.length > 200)) ||
      (key === "slug" && !/^[a-z0-9][a-z0-9-]{0,99}$/.test(v)) ||
      (key === "publicNotes" && v.length > 4000)
    )
      throw Error("说明标题、网址或正文格式无效");
  }
  return { ...data };
}
export function explanationFactWarning(value: string) {
  const numeric =
    /\b\d{4}-\d{1,2}-\d{1,2}\b|\d{4}年\s*\d{1,2}月\s*\d{1,2}日|\d+\s*(?:天|小时)|\b\d+\s*(?:days?|hours?)\b/i;
  return numeric.test(value)
    ? "建议将日期、停留天数或小时数放入事实字段，以免事实更新后说明不一致"
    : null;
}
/** Caller supplies a consistent snapshot; mutable working text is never used publicly. */
export function approvedSharedNote(
  group: number,
  locale: "zh" | "en",
  factVersion: number | null,
  draft: PolicyNoteDraft | null,
  version: PolicyNoteVersion | null,
): NoteBody | null {
  if (
    !factVersion ||
    !draft ||
    !version ||
    draft.needsReview !== false ||
    relationID(draft.group) !== group ||
    draft.locale !== locale ||
    relationID(draft.publishedNoteVersion) !== version.id ||
    relationID(version.group) !== group ||
    version.locale !== locale ||
    relationID(version.basedOnFactVersion) !== factVersion
  )
    return null;
  return { title: version.title, slug: version.slug, publicNotes: version.publicNotes ?? "" };
}
