import { Locked } from "payload";
import { checkOrigin, failure, limitedJSON } from "@/server/content/auth";
import { ContentError } from "@/server/content/error";
import { changeInquiryStatus } from "@/server/inquiry-status";
import { supportPayload } from "@/server/support/auth";
import { authenticateCrm } from "@/server/crm/access";
import { CrmError } from "@/lib/crm";

export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const p = await supportPayload();
    const user = await authenticateCrm(p, req.headers);
    return Response.json(await changeInquiryStatus(p, user, await limitedJSON(req, 12000)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof CrmError) return failure(new ContentError(error.message, error.status));
    if (error instanceof Locked)
      return failure(new ContentError("这条咨询正由其他员工编辑，请稍后刷新。", 423));
    return failure(error);
  }
}
