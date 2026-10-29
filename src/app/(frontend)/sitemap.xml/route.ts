import { locales } from "@/lib/locales";
import { getPayload } from "payload";
import config from "@/payload.config";
import { listPublished } from "@/server/content/service";
import { isCatalog, catalogPath } from "@/lib/catalog";
export const dynamic = "force-dynamic";
const escape = (s: string) =>
  s.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export async function GET() {
  try {
    const p = await getPayload({ config });
    const origin = new URL(process.env.APP_URL || "http://127.0.0.1:3000")
      .origin;
    const urls: string[] = [];
    for (const locale of locales) {
      for (const path of ["", "providers", "services/projects", "guides", "exhibitions", "institutions"])
        urls.push(
          "<url><loc>" +
            escape(origin + "/" + locale + (path ? "/" + path : "")) +
            "</loc></url>",
        );
      for (const d of await listPublished(p, locale)) {
        if (!isCatalog(d.kind) && d.kind !== "guide" && d.kind !== "exhibition" && d.kind !== "institution") continue;
        const path = isCatalog(d.kind)
          ? catalogPath(d)
          : `/${locale}/${d.kind === "institution" ? "institutions" : d.kind === "exhibition" ? "exhibitions" : "guides"}/${d.slug}`;
        urls.push(
          "<url><loc>" +
            escape(origin + path) +
            "</loc>" +
            (d.publishedAt
              ? "<lastmod>" + escape(d.publishedAt) + "</lastmod>"
              : "") +
            "</url>",
        );
      }
    }
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
        urls.join("") +
        "</urlset>",
      {
        headers: {
          "Content-Type": "application/xml",
          "Cache-Control": "no-store",
        },
      },
    );
  } catch {
    return new Response("Sitemap temporarily unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
