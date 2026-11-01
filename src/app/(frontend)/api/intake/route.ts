import { intakeEnabled } from "@/lib/deployment";
import { NextResponse } from "next/server";
import { saveIntake, IntakeConflict } from "@/server/intake";
import { IntakeValidationError } from "@/lib/intake-validation";
import { intakeAllowed } from "@/server/rate-limit";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (!intakeEnabled(process.env))
    return NextResponse.json(
      { error: "Intake is not enabled for this environment." },
      { status: 503, headers },
    );
  if (request.headers.get("origin") !== process.env.APP_URL)
    return NextResponse.json({ error: "Invalid origin" }, { status: 403, headers });
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return NextResponse.json({ error: "JSON required" }, { status: 415, headers });
  try {
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ error: "Body required" }, { status: 400, headers });
    let length = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > 32768) {
        await reader.cancel();
        return NextResponse.json({ error: "Request too large" }, { status: 413, headers });
      }
      chunks.push(part.value);
    }
    let input: unknown;
    try {
      input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers });
    }
    if (!(await intakeAllowed()))
      return NextResponse.json(
        { error: "Too many requests. Please try later." },
        { status: 429, headers: { ...headers, "Retry-After": "600" } },
      );
    const result = await saveIntake(input, request.headers.get("Idempotency-Key") || "");
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201, headers });
  } catch (error) {
    if (error instanceof IntakeValidationError)
      return NextResponse.json(
        { error: "Please check your information.", fields: error.errors },
        { status: 400, headers },
      );
    if (error instanceof IntakeConflict)
      return NextResponse.json({ error: error.message }, { status: 409, headers });
    console.error("Intake storage failed:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json(
      { error: "Unable to confirm saving. Retry with the same request." },
      { status: 503, headers },
    );
  }
}
