import { CrmError } from "./crm.ts";
export function crmQuery(url: string) {
  const q = new URL(url).searchParams;
  const result: Record<string, unknown> = {};
  for (const [key, value] of q) {
    if (key in result || !["action", "clientID", "page", "limit", "q", "status"].includes(key))
      throw new CrmError("查询参数无效");
    if (["clientID", "page", "limit"].includes(key)) {
      if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value)))
        throw new CrmError("查询编号无效");
      result[key] = Number(value);
    } else result[key] = value;
  }
  return result;
}
