import { isSiteLocale } from "@/server/site-config";
import { isLocale } from "@/lib/locales";
import { catalogCities } from "@/lib/catalog-options";
import { getPayload } from "payload";
import config from "@/payload.config";
import { listPublished } from "@/server/content/service";
import {
  filterLifestyle,
  lifeInquiryPath,
  isLife,
  lifeCategories,
  lifePath,
  effectiveLifeStatus,
  type LifeFilters,
} from "@/lib/lifestyle";
import { validExhibitionDate } from "@/lib/exhibitions";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams,
    locale = q.get("locale") || "en",
    page = Number(q.get("page") || 1);
  const f = Object.fromEntries(
    [
      "city",
      "category",
      "kind",
      "language",
      "q",
      "date",
      "status",
      "cuisine",
      "scene",
      "budget",
    ].map((k) => [k, q.get(k) || ""]),
  ) as LifeFilters;
  const key = q.get("key"),
    slug = q.get("slug");
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (
    !isLocale(locale) ||
    !isSiteLocale(locale) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    Object.values(f).some((v) => v.length > 200) ||
    (f.city && !catalogCities.some((c) => c.code === f.city)) ||
    (f.kind && !isLife(f.kind)) ||
    (f.category && !(lifeCategories as readonly string[]).includes(f.category)) ||
    (f.language && !isLocale(f.language)) ||
    (f.date && !validExhibitionDate(f.date)) ||
    (f.status &&
      ![
        "open",
        "paused",
        "closed",
        "scheduled",
        "full",
        "cancelled",
        "postponed",
        "ended",
        "registrationClosed",
      ].includes(f.status)) ||
    (f.budget && (!Number.isFinite(Number(f.budget)) || Number(f.budget) < 0)) ||
    [key, slug].some((v) => v !== null && !/^[a-z0-9][a-z0-9-]{0,99}$/.test(v))
  )
    return Response.json(
      { error: "Invalid filters", docs: "/api/public/life/docs" },
      { status: 400, headers },
    );
  try {
    const docs = filterLifestyle(
      await listPublished(await getPayload({ config }), locale),
      f,
    ).filter((d) => (!key || d.contentKey === key) && (!slug || d.slug === slug));
    if ((key || slug) && !docs.length)
      return Response.json({ error: "Published content not found" }, { status: 404, headers });
    return Response.json(
      {
        schemaVersion: 1,
        locale,
        page,
        pageSize: 20,
        total: docs.length,
        items: docs.slice((page - 1) * 20, page * 20).map((d) => ({
          ...d,
          currentStatus: effectiveLifeStatus(d.lifestyle!, d.kind as "venue" | "activity"),
          path: lifePath(d),
          inquiryPath: d.acceptingInquiries ? lifeInquiryPath(d) : null,
        })),
        docs: "/api/public/life/docs",
      },
      { headers },
    );
  } catch {
    return Response.json({ error: "Temporarily unavailable" }, { status: 503, headers });
  }
}
