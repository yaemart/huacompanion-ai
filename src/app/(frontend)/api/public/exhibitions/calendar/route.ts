import { getPayload } from "payload";
import config from "@/payload.config";
import { listPublished } from "@/server/content/service";
import { isSiteLocale } from "@/server/site-config";
import { isLocale } from "@/lib/locales";
import { isContentIdentifier } from "@/lib/content-identifiers";
import { buildExhibitionCalendar } from "@/lib/exhibition-calendar";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const locale = query.get("locale");
  const key = query.get("key");
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (!isLocale(locale) || !isContentIdentifier(key))
    return Response.json({ error: "Invalid locale or exhibition key" }, { status: 400, headers });
  try {
    if (!isSiteLocale(locale))
      return Response.json({ error: "Invalid locale or exhibition key" }, { status: 400, headers });
    const published = await listPublished(await getPayload({ config }), locale);
    const body = published.find((d) => d.kind === "exhibition" && d.contentKey === key);
    if (!body)
      return Response.json({ error: "Published exhibition not found" }, { status: 404, headers });
    const calendar = buildExhibitionCalendar(body, process.env.APP_URL || "");
    if (!calendar)
      return Response.json(
        { error: "Calendar unavailable for the current dates or status" },
        { status: 409, headers },
      );
    return new Response(calendar, {
      headers: {
        ...headers,
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="exhibition-${locale}-${key}.ics"`,
      },
    });
  } catch {
    return Response.json({ error: "Calendar temporarily unavailable" }, { status: 503, headers });
  }
}
