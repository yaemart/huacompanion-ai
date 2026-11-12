import {
  APIError,
  type CollectionBeforeOperationHook,
  type CollectionBeforeChangeHook,
} from "payload";
import { isInquiryClosed } from "../lib/inquiry-status";
import { transactionSession } from "../server/db-types";

export const inquiryStatusToken = Symbol("inquiryStatus");

export const lockInquiryWrite: CollectionBeforeOperationHook = async ({ operation, req }) => {
  if (operation !== "update" && operation !== "restoreVersion" && operation !== "create") return;
  // Lock before Payload reads the record and fills omitted fields from it.
  const id = await req.transactionID;
  if (!id) throw Error("咨询更新需要数据库事务");
  await transactionSession(req.payload, id).db.execute("SELECT pg_advisory_xact_lock(726281)");
};

export const guardInquiryStatus: CollectionBeforeChangeHook = (args) => {
  const { operation, originalDoc: current, data, req } = args;
  if (operation !== "update" || req.context.inquiryStatusTransition === inquiryStatusToken)
    return data;
  const next = {
    status: data.status === undefined ? current.status : data.status,
    coordinationStage:
      data.coordinationStage === undefined ? current.coordinationStage : data.coordinationStage,
  };
  if (
    next.status === current.status &&
    (next.coordinationStage ?? null) === (current.coordinationStage ?? null)
  )
    return data;
  if (isInquiryClosed(current) || isInquiryClosed(next))
    throw new APIError("关闭或重开咨询时，请在处理操作区选择对应操作并填写原因。", 409);
  if (req.data?.updatedAt && req.data.updatedAt !== current.updatedAt)
    throw new APIError("咨询已被修改，请保留输入，刷新核对后再保存。", 409);
  return data;
};
