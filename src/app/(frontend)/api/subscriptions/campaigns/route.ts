import { limitedJSON } from "@/server/content/auth";
import { ContentError } from "@/server/content/error";
import { campaignStaffAuth } from "@/server/subscription-campaign-workspace";
import { setCampaignGrant } from "@/server/subscription-campaign-access";
import { saveCampaignDraft } from "@/server/subscription-campaign-drafts";
import { freezeCampaignRecipients } from "@/server/subscription-campaign-freeze";
import { campaignMockChecks } from "@/server/subscription-campaign-mock-checks";
import { cancelMockCampaign } from "@/server/subscription-campaign-cancel";
import { readCampaignPause, setCampaignPause } from "@/server/subscription-campaign-control";
import { readCampaignTaskStatus } from "@/server/subscription-campaign-status";
import { readCampaignMockSlots } from "@/server/subscription-campaign-task-options";
import {
  claimMockCampaignTask,
  beginMockCampaignAttempt,
  recordMockCampaignOutcome,
} from "@/server/subscription-campaign-leases";

export const runtime = "nodejs";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
};
export async function POST(request: Request) {
  try {
    const { p, user } = await campaignStaffAuth(request.headers);
    if (URL.parse(process.env.APP_URL ?? "")?.origin !== request.headers.get("origin"))
      throw new ContentError("请从华伴政策群发草稿页重新打开后操作。", 403);
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json")
      throw new ContentError("请使用页面上的操作按钮。", 415);
    const body: unknown = await limitedJSON(request, 16384);
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).some((key) => !["action", "input"].includes(key)) ||
      !("action" in body) ||
      !("input" in body)
    )
      throw new ContentError("操作内容无效，请重新打开页面。", 400);
    if (body.action === "read-mock-slots-local") {
      return Response.json(
        { slots: await readCampaignMockSlots(p, user, body.input) },
        { headers },
      );
    }
    const taskAction =
      body.action === "claim-mock-task-local"
        ? claimMockCampaignTask
        : body.action === "begin-mock-attempt-local"
          ? beginMockCampaignAttempt
          : body.action === "record-mock-result-local"
            ? recordMockCampaignOutcome
            : null;
    if (taskAction)
      return Response.json({ task: await taskAction(p, user, body.input) }, { headers });
    if (body.action === "read-mock-status-local") {
      const taskStatus = await readCampaignTaskStatus(p, user, body.input);
      return Response.json({ taskStatus }, { headers });
    }
    if (body.action === "cancel-local") {
      const input = body.input;
      if (
        !input ||
        typeof input !== "object" ||
        Array.isArray(input) ||
        Object.keys(input).some(
          (key) => !["campaignKey", "revision", "reason", "confirmed"].includes(key),
        ) ||
        !("campaignKey" in input) ||
        !("revision" in input) ||
        !("reason" in input) ||
        !("confirmed" in input) ||
        input.confirmed !== true
      )
        throw new ContentError("请填写原因，并明确确认取消后不能恢复。", 400);
      const cancellation = await cancelMockCampaign(p, user, {
        campaignKey: input.campaignKey,
        revision: input.revision,
        reason: input.reason,
      });
      return Response.json({ cancellation }, { headers });
    }
    if (body.action === "read-control-local") {
      const control = await readCampaignPause(p, user, body.input);
      return Response.json({ control }, { headers });
    }
    if (body.action === "control-local") {
      const control = await setCampaignPause(p, user, body.input);
      return Response.json({ control }, { headers });
    }
    if (body.action === "grant") {
      await setCampaignGrant(p, user, body.input as Parameters<typeof setCampaignGrant>[2]);
      return Response.json({ updated: true }, { headers });
    }
    if (body.action === "freeze-local") {
      const snapshot = await freezeCampaignRecipients(p, user, body.input);
      return Response.json({ snapshot }, { headers });
    }
    if (body.action === "mock-test" || body.action === "mock-confirm") {
      const result = await campaignMockChecks(
        p,
        user,
        body.action === "mock-test" ? "test" : "confirm",
        body.input,
      );
      return Response.json({ campaignKey: result.campaignKey }, { headers });
    }
    if (body.action !== "save") throw new ContentError("请选择草稿、授权或本地模拟操作。", 400);
    const result = await saveCampaignDraft(p, user, body.input);
    return Response.json({ campaignKey: result.campaignKey }, { headers });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof ContentError
            ? error.message
            : "操作未完成，当前填写已保留，请稍后重试。",
      },
      { status: error instanceof ContentError ? error.status : 503, headers },
    );
  }
}
