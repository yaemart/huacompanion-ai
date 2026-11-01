import { callLimits } from "../../lib/calls";
import { ContentError } from "../content/service";
function gatewayConfigured() {
  let base = false;
  try {
    const u = new URL(process.env.SUPPORT_CALL_GATEWAY_URL || "");
    base =
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !!process.env.SUPPORT_CALL_GATEWAY_KEY;
  } catch {}
  return base;
}
export function callReadiness() {
  const base = gatewayConfigured() && callLimits(process.env).configured;
  return { humanCalls: base, aiCalls: base && process.env.SUPPORT_CALL_AI_ENABLED === "true" };
}
export async function callGateway(path: string, body?: unknown, method = "POST"): Promise<any> {
  if (!gatewayConfigured()) throw new ContentError("Call service is not configured", 503);
  try {
    const r = await fetch(
      `${process.env.SUPPORT_CALL_GATEWAY_URL!.replace(/\/$/, "")}/v1/${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${process.env.SUPPORT_CALL_GATEWAY_KEY}`,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
        redirect: "error",
      },
    );
    if (!r.ok) throw Error("Gateway request failed");
    if (r.status === 204) return {};
    const reader = r.body?.getReader();
    if (!reader) throw Error("No gateway response");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 150000) {
        await reader.cancel();
        throw Error("Gateway response too large");
      }
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ContentError("Call service unavailable", 503);
  }
}
