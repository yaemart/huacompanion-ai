import { customerEmail } from "./customer.ts";

export class CrmError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
export const crmActions = [
  "createClient",
  "updateClient",
  "saveContact",
  "setPrimaryContact",
  "archiveContact",
  "archiveClient",
  "linkInquiry",
  "revokeInquiryLink",
] as const;
export type CrmAction = (typeof crmActions)[number];
export interface CrmInput {
  action: CrmAction;
  operationKey: string;
  clientID?: number;
  expectedRevision?: number;
  expectedClientRevision?: number;
  contactID?: number;
  inquiryID?: number;
  linkID?: number;
  expectedLinkRevision?: number;
  teamID?: number;
  ownerID?: number | null;
  kind?: "individual" | "company";
  displayName?: string;
  language?: "en" | "zh";
  countryCode?: string | null;
  name?: string;
  email?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
  reason?: string;
}
const fields: Record<CrmAction, string[]> = {
  createClient: ["kind", "displayName", "language", "countryCode", "teamID", "ownerID"],
  updateClient: ["clientID", "expectedRevision", "displayName", "language", "countryCode"],
  saveContact: [
    "clientID",
    "expectedClientRevision",
    "contactID",
    "expectedRevision",
    "name",
    "email",
    "phone",
    "jobTitle",
  ],
  setPrimaryContact: ["clientID", "expectedClientRevision", "contactID"],
  archiveContact: ["clientID", "expectedClientRevision", "contactID", "expectedRevision", "reason"],
  archiveClient: ["clientID", "expectedRevision", "reason"],
  linkInquiry: [
    "clientID",
    "inquiryID",
    "expectedClientRevision",
    "expectedLinkRevision",
    "reason",
  ],
  revokeInquiryLink: ["clientID", "linkID", "expectedClientRevision", "expectedRevision", "reason"],
};
export function crmID(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
    throw new CrmError("编号必须是正安全整数");
  return value;
}
export function parseCrmAction(raw: unknown): CrmInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new CrmError("无效请求");
  const data = raw as Record<string, unknown>;
  const action = data.action as CrmAction;
  if (!crmActions.includes(action)) throw new CrmError("不支持的操作");
  for (const key of Object.keys(data))
    if (!["action", "operationKey", ...fields[action]].includes(key))
      throw new CrmError("包含未允许字段");
  if (
    typeof data.operationKey !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      data.operationKey,
    )
  )
    throw new CrmError("操作编号无效");
  const result: Record<string, unknown> = { action, operationKey: data.operationKey.toLowerCase() };
  for (const key of fields[action]) {
    if (!(key in data)) continue;
    const v = data[key];
    if (key === "expectedLinkRevision") {
      if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0)
        throw new CrmError("关联版本无效");
      result[key] = v;
    } else if (
      [
        "inquiryID",
        "linkID",
        "clientID",
        "expectedRevision",
        "expectedClientRevision",
        "contactID",
        "teamID",
        "ownerID",
      ].includes(key)
    ) {
      result[key] = key === "ownerID" && v === null ? null : crmID(v);
    } else if (["kind", "language"].includes(key)) {
      const options = key === "kind" ? ["individual", "company"] : ["en", "zh"];
      if (!options.includes(v as string)) throw new CrmError("类型或语言无效");
      result[key] = v;
    } else {
      const optional = ["countryCode", "email", "phone", "jobTitle"].includes(key);
      if (v === null && optional) {
        result[key] = null;
        continue;
      }
      if (typeof v !== "string") throw new CrmError("资料必须是文字");
      const value = v.trim();
      const max =
        key === "reason"
          ? 2000
          : key === "email"
            ? 254
            : ["phone", "jobTitle"].includes(key)
              ? 100
              : 200;
      if (value.length > max || (!optional && value.length < (key === "reason" ? 10 : 1)))
        throw new CrmError("资料长度无效");
      if (key === "countryCode" && value && !/^[A-Z]{2}$/.test(value))
        throw new CrmError("国家代码无效");
      if (key === "email" && value) {
        try {
          result[key] = customerEmail(value);
        } catch {
          throw new CrmError("邮箱无效");
        }
      } else result[key] = value || null;
    }
  }
  const required =
    action === "createClient"
      ? ["kind", "displayName", "language"]
      : action === "updateClient" || action === "archiveClient"
        ? ["clientID", "expectedRevision"]
        : ["clientID", "expectedClientRevision"];
  if (action === "saveContact" && !data.contactID) required.push("name");
  if (["archiveContact", "archiveClient"].includes(action)) required.push("reason");
  if (["setPrimaryContact", "archiveContact"].includes(action)) required.push("contactID");
  if (action === "archiveContact" || (action === "saveContact" && data.contactID))
    required.push("expectedRevision");
  if (action === "linkInquiry") required.push("inquiryID", "expectedLinkRevision", "reason");
  if (action === "revokeInquiryLink") required.push("linkID", "expectedRevision", "reason");
  for (const key of required) if (result[key] === undefined) throw new CrmError("缺少必要资料");
  if (action === "saveContact" && !data.contactID && !result.email && !result.phone)
    throw new CrmError("至少提供邮箱或电话");
  if (action === "saveContact" && !data.contactID && "expectedRevision" in data)
    throw new CrmError("新联系人不能提供旧版本");
  if (
    ["saveContact", "updateClient"].includes(action) &&
    !Object.keys(data).some((k) =>
      (action === "saveContact"
        ? ["name", "email", "phone", "jobTitle"]
        : ["displayName", "language", "countryCode"]
      ).includes(k),
    )
  )
    throw new CrmError("没有可修改资料");
  return result as unknown as CrmInput;
}
