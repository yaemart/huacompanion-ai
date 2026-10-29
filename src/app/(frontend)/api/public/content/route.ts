import { isLocale } from "@/lib/locales";
import { isCatalog, catalogPath } from "@/lib/catalog";
import { getPayload } from "payload";
import config from "@/payload.config";
import { listPublished } from "@/server/content/service";
import { contentSections, sectionFor } from "@/lib/content-sections";
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const locale = q.get("locale") || "en";
  if (!isLocale(locale))
    return Response.json({ error: "locale must be zh, en, es, fr, de, it or ar" }, { status: 400 });
  const section = q.get("section");
  const sectionEntry = contentSections.find((s) => s.key === section);
  if (section && !sectionEntry)
    return Response.json({ error: "Unknown section" }, { status: 400 });
  const page = Number(q.get("page") || 1);
  if (!Number.isSafeInteger(page) || page < 1)
    return Response.json({ error: "Invalid page" }, { status: 400 });
  try {
    const items = (
      await listPublished(await getPayload({ config }), locale)
    ).filter((d) => !sectionEntry || sectionFor(d) === sectionEntry.id);
    const docs = items
      .slice((page - 1) * 20, page * 20)
      .map((d) => ({
        ...d,
        section: contentSections.find((s) => s.id === sectionFor(d))?.key,
        path: isCatalog(d.kind)
          ? catalogPath(d)
          : d.kind === "institution"
            ? `/${locale}/institutions/${d.slug}`
          : d.kind === "exhibition"
            ? `/${locale}/exhibitions/${d.slug}`
          : d.kind === "guide"
            ? `/${locale}/guides/${d.slug}`
            : d.kind === "service"
              ? `/${locale}/services/${d.slug}`
              : d.kind === "partner"
                ? `/${locale}/partners/${d.slug}`
                : d.kind === "page"
                  ? `/${locale}/${d.slug === "home" ? "" : d.slug}`
                  : `/${locale}#faq-${d.contentKey}`,
      }));
    return Response.json(
      {
        schemaVersion: 1,
        locale,
        page,
        pageSize: 20,
        total: items.length,
        sections: contentSections.map((s) => ({
          key: s.key,
          title: s[locale],
        })),
        items: docs,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch {
    return Response.json(
      { error: "Published content temporarily unavailable" },
      { status: 503 },
    );
  }
}
