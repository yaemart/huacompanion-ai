import { NextResponse } from "next/server";
import { visitorSession, supportPayload } from "@/server/support/auth";
import { callAction, callRead, runCallMaintenance } from "@/server/support/callService";
import { checkOrigin, limitedJSON, failure } from "@/server/content/auth";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    return NextResponse.json(
      await callRead(
        await supportPayload(),
        { hash: visitorSession(req.headers).hash },
        new URL(req.url).searchParams.get("conversation"),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const p = await supportPayload();
    const result = await callAction(
      p,
      { hash: visitorSession(req.headers).hash },
      await limitedJSON(req, 110000),
    );
    if (Number.isInteger(result?.id)) await runCallMaintenance(p, result.id).catch(() => {});
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return failure(e);
  }
}
