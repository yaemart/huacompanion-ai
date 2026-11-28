import { CrmError } from "../../lib/crm.ts";
import { ContentError } from "../content/error.ts";
export const crmHeaders = {
  "Cache-Control": "no-store",
  Vary: "Cookie, Authorization",
  "X-Content-Type-Options": "nosniff",
};
export function crmFailure(error: unknown) {
  const known = error instanceof CrmError || error instanceof ContentError;
  return Response.json(
    { error: known ? error.message : "操作结果未确认，请保留输入并核实原操作。" },
    { status: known ? error.status : 500, headers: crmHeaders },
  );
}
export { crmQuery } from "../../lib/crm-http-query";
