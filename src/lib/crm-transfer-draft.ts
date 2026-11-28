import type { TransferInput, TransferPreview, TransferReceipt } from "./crm-assignments.ts";
export type TransferDraftInput = Omit<TransferInput, "operationKey">;
export type PreviewInquiry = TransferPreview["inquiries"][number];
export interface TransferDraft {
  base: TransferPreview;
  current: TransferPreview;
  selected: PreviewInquiry[];
  transferClient: boolean;
  recipientID: string;
  reason: string;
  review: boolean;
}
export function newTransferDraft(preview: TransferPreview): TransferDraft {
  const snapshot = structuredClone(preview);
  return {
    base: snapshot,
    current: snapshot,
    selected: [],
    transferClient: false,
    recipientID: "",
    reason: "",
    review: false,
  };
}
export function toggleTransferInquiry(d: TransferDraft, id: number): TransferDraft {
  const exists = d.selected.some((q) => q.inquiryID === id);
  if (exists)
    return { ...d, selected: d.selected.filter((q) => q.inquiryID !== id), review: false };
  if (d.selected.length >= 20) throw Error("每次最多选择20条咨询，请分批核对");
  const item = d.current.inquiries.find((q) => q.inquiryID === id);
  if (!item) throw Error("当前页没有此咨询，请重新核对");
  return {
    ...d,
    selected: [...d.selected, structuredClone(item)].sort((a, b) => a.inquiryID - b.inquiryID),
    review: false,
  };
}
export function mergeTransferPage(d: TransferDraft, preview: TransferPreview): TransferDraft {
  if (
    preview.clientID !== d.base.clientID ||
    preview.expectedClientRevision !== d.base.expectedClientRevision
  )
    throw Error("客户版本已变化；当前填写已保留，请复制原因后取消并重新打开转交预览");
  return { ...d, current: structuredClone(preview) };
}
export function captureTransferDraft(
  d: TransferDraft,
  recipientID: number,
  reason: string,
): TransferDraftInput {
  if (!d.base.receivers.some((s) => s.id === recipientID)) throw Error("请选择本团队接收人");
  if (!d.transferClient && !d.selected.length) throw Error("请明确选择客户主负责人或咨询");
  if (reason.trim().length < 10 || reason.trim().length > 2000)
    throw Error("请填写10至2000字转交原因");
  return {
    action: "transferAssignments",
    clientID: d.base.clientID,
    expectedClientRevision: d.base.expectedClientRevision,
    transferClient: d.transferClient,
    recipientID,
    reason: reason.trim(),
    inquiries: d.selected.map((q) => ({
      inquiryID: q.inquiryID,
      expectedUpdatedAt: q.expectedUpdatedAt,
      expectedOwnerID: q.expectedOwnerID,
      expectedCaseRevision: q.expectedCaseRevision,
    })),
  };
}
export function confirmedTransfer(
  value: unknown,
  input: TransferDraftInput,
): value is TransferReceipt {
  if (!value || typeof value !== "object") return false;
  const r = value as TransferReceipt;
  return (
    r.clientID === input.clientID &&
    Number.isSafeInteger(r.revision) &&
    r.revision > 0 &&
    Number.isSafeInteger(r.transferID) &&
    r.transferID > 0 &&
    typeof r.transferredClient === "boolean" &&
    (!r.transferredClient || input.transferClient) &&
    Array.isArray(r.inquiryIDs) &&
    new Set(r.inquiryIDs).size === r.inquiryIDs.length &&
    (r.transferredClient || r.inquiryIDs.length > 0) &&
    r.inquiryIDs.every(
      (id) => Number.isSafeInteger(id) && id > 0 && input.inquiries.some((q) => q.inquiryID === id),
    )
  );
}
export function transferResultLabel(r: TransferReceipt): string {
  return `实际变更：客户主负责人 ${r.transferredClient ? 1 : 0} 项；咨询 ${r.inquiryIDs.length} 项（派生服务单责任沿咨询）。`;
}
