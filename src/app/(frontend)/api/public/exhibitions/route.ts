import { isSiteLocale } from "@/server/site-config";
import { isLocale } from "@/lib/locales";
import { catalogCities } from "@/lib/catalog-options";
import { getPayload } from "payload";
import config from "@/payload.config";
import { listPublished } from "@/server/content/service";
import {
  exhibitionIndustries,
  filterExhibitions,
  exhibitionPath,
  effectiveExhibitionStatus,
  type ExhibitionFilters,
} from "@/lib/exhibitions";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const locale = q.get("locale") || "en",
    page = Number(q.get("page") || 1);
  const city = q.get("city") || "",
    industry = q.get("industry") || "",
    month = q.get("month") || "",
    query = q.get("q") || "";
  const period = q.get("period") || "upcoming",
    key = q.get("key"),
    slug = q.get("slug");
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (
    !isLocale(locale) ||
    !isSiteLocale(locale) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    query.length > 200 ||
    (city && !catalogCities.some((c) => c.code === city)) ||
    (industry && !(exhibitionIndustries as readonly string[]).includes(industry)) ||
    (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) ||
    !["upcoming", "past", "all"].includes(period) ||
    (key !== null && !/^[a-z0-9][a-z0-9-]{0,99}$/.test(key)) ||
    (slug !== null && !/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug))
  )
    return Response.json(
      { error: "Invalid locale, filters, key, slug or page", docs: "/api/public/exhibitions/docs" },
      { status: 400, headers },
    );
  try {
    const published = await listPublished(await getPayload({ config }), locale);
    const items = filterExhibitions(published, {
      city,
      industry,
      month,
      q: query,
      period: key || slug ? "all" : (period as ExhibitionFilters["period"]),
    }).filter((d) => (!key || d.contentKey === key) && (!slug || d.slug === slug));
    if ((key || slug) && !items.length)
      return Response.json({ error: "Published exhibition not found" }, { status: 404, headers });
    return Response.json(
      {
        schemaVersion: 1,
        locale,
        page,
        pageSize: 20,
        total: items.length,
        items: items.slice((page - 1) * 20, page * 20).map((d) => {
          const status = effectiveExhibitionStatus(d.exhibition!);
          return {
            ...d,
            exhibition: { ...d.exhibition!, status },
            path: exhibitionPath(d),
            inquiryPath: ["ended", "cancelled"].includes(status)
              ? null
              : `/${locale}/request?${new URLSearchParams({ exhibition: d.contentKey, service: "business" })}`,
          };
        }),
        docs: "/api/public/exhibitions/docs",
      },
      { headers },
    );
  } catch {
    return Response.json(
      { error: "Exhibitions temporarily unavailable" },
      { status: 503, headers },
    );
  }
}
