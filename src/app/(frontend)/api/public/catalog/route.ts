import { homeServices } from "@/lib/housekeeping";
import { isLocale } from "@/lib/locales";
import { getPayload } from "payload";
import config from "@/payload.config";
import { listPublished } from "@/server/content/service";
import { catalogFilter, catalogPath } from "@/lib/catalog";
import { serviceSlugs } from "@/lib/routes";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const locale = q.get("locale") || "en",
    kind = q.get("kind") || "",
    category = q.get("category") || "",
    page = Number(q.get("page") || 1);
  const headers = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (
    !isLocale(locale) ||
    (q.has("homeService") &&
      q.get("homeService") !== "" &&
      !(homeServices as readonly string[]).includes(q.get("homeService")!)) ||
    (q.get("district") || "").length > 200 ||
    (q.has("equipment") &&
      q.get("equipment") !== "" &&
      !["provider", "customer", "confirm"].includes(q.get("equipment")!)) ||
    (kind && !["provider-profile", "service-project"].includes(kind)) ||
    (category && !serviceSlugs.includes(category)) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    (q.get("q") || "").length > 200
  )
    return Response.json(
      {
        error: "Invalid locale, kind, category, query or page",
        docs: "/api/public/catalog/docs",
      },
      { status: 400, headers },
    );
  try {
    let items = catalogFilter(await listPublished(await getPayload({ config }), locale), {
      kind,
      category,
      homeService: q.get("homeService") || "",
      district: q.get("district") || "",
      equipment: q.get("equipment") || "",
      city: q.get("city") || "",
      language: q.get("language") || "",
      q: q.get("q") || "",
    });
    if (q.has("key")) items = items.filter((d) => d.contentKey === q.get("key"));
    if (q.has("key") && !items.length)
      return Response.json({ error: "Published item not found" }, { status: 404, headers });
    return Response.json(
      {
        schemaVersion: 1,
        locale,
        page,
        pageSize: 20,
        total: items.length,
        items: items.slice((page - 1) * 20, page * 20).map((d) => ({
          ...d,
          path: catalogPath(d),
          inquiryPath: d.acceptingInquiries
            ? `/${locale}/request?` +
              new URLSearchParams({
                [d.kind === "provider-profile" ? "provider" : "project"]: d.contentKey,
                service: d.catalog!.categories.includes("housekeeping")
                  ? "housekeeping"
                  : d.catalog!.categories[0],
                ...(d.catalog!.categories.includes("housekeeping")
                  ? {
                      [d.kind === "provider-profile" ? "providerRevision" : "projectRevision"]:
                        String(d.publicationRevision),
                    }
                  : {}),
              })
            : null,
        })),
        docs: "/api/public/catalog/docs",
      },
      { headers },
    );
  } catch {
    return Response.json({ error: "Catalog temporarily unavailable" }, { status: 503, headers });
  }
}
