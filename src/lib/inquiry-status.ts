import type { Inquiry } from "../../payload-types";

export type InquiryStatus = Inquiry["status"];
export type InquiryStage = NonNullable<Inquiry["coordinationStage"]>;
export type InquiryPair = Pick<Inquiry, "status" | "coordinationStage">;
export const inquiryStatusLabels: Record<InquiryStatus, string> = {
  new: "新咨询",
  "needs-info": "待补充",
  processing: "处理中",
  quoted: "已报价",
  won: "已成交",
  closed: "已关闭",
};
export const coordinationStageLabels: Record<InquiryStage, string> = {
  received: "待受理",
  contacting: "联系客户",
  confirming: "与机构／服务商确认",
  proposal: "方案待确认",
  scheduled: "已确认人员与预约",
  aftercare: "售后跟进",
  completed: "已完成",
  closed: "已关闭",
};

export function isInquiryClosed({ status, coordinationStage }: InquiryPair) {
  return status === "closed" || coordinationStage === "closed";
}
