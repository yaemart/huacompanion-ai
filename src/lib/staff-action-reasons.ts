export const actionInProgress = "正在处理，请稍候。";
export const saveChangesFirst = "请先保存当前修改。";

export function draftEditReason(canEdit: boolean, waiting: boolean) {
  if (!canEdit) return "请联系有编辑权限的员工。";
  if (waiting) return "待审核草稿已锁定，请联系审核员退回修改。";
}

export function ownReviewReason(own: boolean, isAdmin: boolean, reason: string) {
  if (!own) return;
  if (!isAdmin) return "请交由另一位审核员处理。";
  if (!reason.trim()) return "请填写管理员自审例外原因。";
}

export function contentPublishReason({
  busy,
  waiting,
  own,
  isAdmin,
  reason,
  unchecked,
}: {
  busy: boolean;
  waiting: boolean;
  own: boolean;
  isAdmin: boolean;
  reason: string;
  unchecked?: string;
}) {
  if (busy) return actionInProgress;
  if (!waiting) return "请先将草稿提交审核。";
  return (
    ownReviewReason(own, isAdmin, reason) ||
    (unchecked ? `请先核对并勾选「${unchecked}」。` : undefined)
  );
}

export function policyActionReasons({
  saving,
  canEdit,
  canReview,
  waiting,
  dirty,
  saved,
  own,
  isAdmin,
  reason,
  checked,
  published,
  note,
}: {
  saving: boolean;
  canEdit: boolean;
  canReview: boolean;
  waiting: boolean;
  dirty: boolean;
  saved: boolean;
  own: boolean;
  isAdmin: boolean;
  reason: string;
  checked: boolean;
  published: boolean;
  note?: { hasFacts: boolean; currentBasis: boolean };
}) {
  const processing = saving ? actionInProgress : undefined;
  const unsaved = dirty ? saveChangesFirst : undefined;
  const edit = processing || draftEditReason(canEdit, waiting);
  const review = processing || (!canReview ? "请联系有审核权限的员工。" : undefined);
  const reviewWaiting = review || (!waiting ? "请先将草稿提交审核。" : undefined);
  const self = ownReviewReason(own, isAdmin, reason);
  const facts =
    note &&
    (!note.hasFacts
      ? "请先发布共用事实。"
      : !note.currentBasis
        ? "请按最新事实核对说明并保存。"
        : undefined);
  return {
    save: edit,
    submit: edit || (!saved ? "请先保存草稿。" : undefined) || unsaved || facts,
    return: reviewWaiting || self || unsaved || (!reason.trim() ? "请填写退回原因。" : undefined),
    publish:
      reviewWaiting ||
      self ||
      unsaved ||
      facts ||
      (!checked ? "请先核对资料并勾选确认。" : undefined),
    unpublish: review || self || (!published ? "尚无已发布版本可下架。" : undefined) || unsaved,
  };
}

export function quoteDecisionReasons({
  busy,
  author,
  exception,
  reason,
  missingDifference,
  missingCollection,
}: {
  busy: boolean;
  author: boolean;
  exception: boolean;
  reason: string;
  missingDifference: boolean;
  missingCollection: boolean;
}) {
  const common = busy
    ? actionInProgress
    : author && !exception
      ? "请勾选「使用管理员自审例外」。"
      : !reason.trim()
        ? author
          ? "请填写自审例外原因。"
          : "请填写审核意见。"
        : undefined;
  return {
    approve:
      common ||
      (missingDifference
        ? "请逐项勾选签约方与收款方的差异确认。"
        : missingCollection
          ? "请逐项勾选华伴代收确认。"
          : undefined),
    reject: common,
  };
}

export function quoteSendReason(
  busy: boolean,
  state: "unsubmitted" | "pending" | "approved" | "rejected",
  needsResubmission: boolean,
) {
  if (busy) return actionInProgress;
  if (state === "approved") return;
  if (state === "pending") return "请等待第二人审核通过后再发出。";
  if (state === "rejected") return "请按审核意见修改并保存新版本，再提交审核。";
  return needsResubmission ? "请重新提交审核，通过后再发出。" : "请先提交审核，通过后再发出。";
}
