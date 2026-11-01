import type { Payload } from "payload";
import type { Locale } from "../lib/locales";
import { seoPages } from "../lib/seo";

export async function pageSEO(payload: Payload, locale: Locale, pathname: string) {
  const path = pathname === "home" ? "" : pathname;
  if (!seoPages.some((page) => page.path === path)) return undefined;
  const settings = await payload.findGlobal({
    slug: "seo-settings",
    overrideAccess: true,
    depth: 0,
  });
  const entry = settings.pages?.find(
    (page) => page.locale === locale && page.path === (path || "home"),
  );
  if (!entry) return undefined;
  return {
    seoTitle: entry.seoTitle || undefined,
    seoDescription: entry.seoDescription || undefined,
    seoImage: typeof entry.seoImage === "number" ? entry.seoImage : undefined,
  };
}

export async function isStaticSEOImage(payload: Payload, id: number) {
  const settings = await payload.findGlobal({
    slug: "seo-settings",
    overrideAccess: true,
    depth: 0,
  });
  return !!settings.pages?.some((page) => page.seoImage === id);
}
