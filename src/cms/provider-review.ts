import type { CollectionBeforeChangeHook } from "payload";
import { APIError } from "payload";
export const providerReviewToken = Symbol("provider-review");
export const guardProviderReview: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  req,
  operation,
}) => {
  if (
    operation === "update" &&
    req.context.providerReview !== providerReviewToken &&
    (req.payloadAPI === "REST" || "editBase" in data)
  ) {
    const current = await req.payload.findByID({
      collection: "providers",
      id: originalDoc.id,
      req,
      depth: 0,
    });
    if (typeof data.editBase !== "string" || data.editBase !== current.updatedAt)
      throw new APIError("资料已被修改或缺少版本，请保留输入，刷新核对后再保存", 409);
  }
  if (
    operation === "update" &&
    "status" in data &&
    data.status !== originalDoc.status &&
    req.context.providerReview !== providerReviewToken
  )
    throw Error("请使用合作审核按钮，填写原因后再操作");
  return data;
};
