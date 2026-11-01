import { getSiteLocales } from "@/server/site-config";
import { sitemapXML } from "@/lib/seo";
import { getPayload } from "payload";
import config from "@/payload.config";
import { listPublished } from "@/server/content/service";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const locales = getSiteLocales();
    const p = await getPayload({ config });
    const origin = new URL(process.env.APP_URL || "http://127.0.0.1:3000").origin;
    const published = (await Promise.all(locales.map((locale) => listPublished(p, locale)))).flat();
    return new Response(sitemapXML(origin, published, locales), {
      headers: { "Content-Type": "application/xml", "Cache-Control": "no-store" },
    });
  } catch {
    return new Response("Sitemap temporarily unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
