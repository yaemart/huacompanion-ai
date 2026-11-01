import { isLocale } from "@/lib/locales";
import { catalogCities } from "@/lib/catalog-options";
import { getPayload } from "payload";
import config from "@/payload.config";
import { listPublished } from "@/server/content/service";
import { institutionTypes, filterInstitutions, institutionPath } from "@/lib/institutions";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const locale = q.get("locale") || "en",
    page = Number(q.get("page") || 1);
  const city = q.get("city") || "",
    type = q.get("type") || "",
    language = q.get("language") || "",
    query = q.get("q") || "";
  const key = q.get("key"),
    slug = q.get("slug");
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (
    !isLocale(locale) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    query.length > 200 ||
    (city && !catalogCities.some((c) => c.code === city)) ||
    (type && !(institutionTypes as readonly string[]).includes(type)) ||
    (language && !isLocale(language)) ||
    (key !== null && !/^[a-z0-9][a-z0-9-]{0,99}$/.test(key)) ||
    (slug !== null && !/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug))
  )
    return Response.json(
      {
        error: "Invalid locale, filters, key, slug or page",
        docs: "/api/public/institutions/docs",
      },
      { status: 400, headers },
    );
  try {
    const published = await listPublished(await getPayload({ config }), locale);
    const items = filterInstitutions(published, { city, type, language, q: query }).filter(
      (d) => (!key || d.contentKey === key) && (!slug || d.slug === slug),
    );
    if ((key || slug) && !items.length)
      return Response.json({ error: "Published institution not found" }, { status: 404, headers });
    return Response.json(
      {
        schemaVersion: 1,
        locale,
        page,
        pageSize: 20,
        total: items.length,
        items: items.slice((page - 1) * 20, page * 20).map((d) => ({
          ...d,
          path: institutionPath(d),
          inquiryPath: d.acceptingInquiries
            ? `/${locale}/request?${new URLSearchParams({ institution: d.contentKey, service: "medical" })}`
            : null,
        })),
        docs: "/api/public/institutions/docs",
      },
      { headers },
    );
  } catch {
    return Response.json(
      { error: "Institutions temporarily unavailable" },
      { status: 503, headers },
    );
  }
}
