import { translatedPaths } from "@/lib/translated-paths";
import type { ContentBody } from "@/lib/content-model";
import { isLocale, locales } from "@/lib/locales";
import { coreText } from "@/lib/core-copy";
import { CatalogPage } from "@/components/catalog/CatalogPage";
import { resolveCatalogSource } from "@/server/catalog/source";
import { parseCatalogSource, inquiryFormKey } from "@/lib/catalog";
import { notFound } from "next/navigation";
import { Site } from "@/components/Site";
import { isKnownRoute, type Locale } from "@/lib/routes";
import { getPayload } from "payload";
import config from "@/payload.config";
import { listPublished } from "@/server/content/service";
import { PublishedSite } from "@/components/content/PublishedSite";
import { cache } from "react";
const content = cache(async (locale: string) =>
  listPublished(await getPayload({ config }), locale),
);
async function languagePaths(detail?:ContentBody) {
  if (!detail) return undefined;
  const all = (await Promise.all(locales.map(locale => content(locale)))).flat();
  return translatedPaths(detail, all);
}
export const dynamic = "force-dynamic";
type Props = {
  params: Promise<{ locale: string; slug?: string[] }>;
  searchParams: Promise<{
    service?: string;
    provider?: string;
    project?: string;
    category?: string;
    city?: string;
    language?: string;
    q?: string;
    page?: string;
  }>;
};
export async function generateMetadata({ params }: Props) {
  const { locale, slug = [] } = await params;
  if (!isLocale(locale)) notFound();
  const l = locale;
  const docs = await content(l);
  const catalogKind =
    slug[0] === "providers"
      ? "provider-profile"
      : slug[0] === "services" && slug[1] === "projects"
        ? "service-project"
        : undefined;
  const catalogSlug = catalogKind === "provider-profile" ? slug[1] : slug[2];
  const catalogDetail = catalogKind
    ? docs.find((d) => d.kind === catalogKind && d.slug === catalogSlug)
    : undefined;
  const detail =
    catalogDetail ||
    docs.find(
      (d) =>
        d.kind ===
          (slug[0] === "services"
            ? "service"
            : slug[0] === "guides"
              ? "guide"
              : "page") && d.slug === (slug[1] || slug[0] || "home"),
    );
  const titles: Record<string,string> = {services:"Our services",guides:"Knowledge centre",partners:"Partner with us",about:"About us",contact:"Contact",request:"Plan your visit",apply:"Partner application",privacy:"Privacy notice",terms:"Service boundaries"};
  const title = detail?.seoTitle || detail?.title || coreText(l, catalogKind ? (catalogKind === "provider-profile" ? "Service providers" : "Hua service projects") : titles[slug[0]] || "Your local companion in China.");
  return {
    ...(catalogKind
      ? { alternates: { canonical: `/${l}/${slug.join("/")}` } }
      : {}),
    description: detail?.seoDescription || detail?.summary,
    title: `${title} | Hua Companion · 华伴`,
  };
}
export default async function Page({ params, searchParams }: Props) {
  const { locale, slug = [] } = await params;
  if (!isLocale(locale)) notFound();
  const docs = await content(locale);
  if (
    slug[0] === "providers" ||
    (slug[0] === "services" && slug[1] === "projects")
  ) {
    const kind =
      slug[0] === "providers" ? "provider-profile" : "service-project";
    const itemSlug = kind === "provider-profile" ? slug[1] : slug[2];
    if (slug.length > (kind === "provider-profile" ? 2 : 3)) notFound();
    const detail = itemSlug
      ? docs.find((d) => d.kind === kind && d.slug === itemSlug)
      : undefined;
    if (itemSlug && !detail) notFound();
    return (
      <CatalogPage
        items={docs}
        locale={locale as Locale}
        kind={kind}
        detail={detail}
        query={await searchParams}
        languagePaths={await languagePaths(detail)}
      />
    );
  }
  const dynamicDetail =
    slug.length === 2 && ["services", "guides", "partners"].includes(slug[0]);
  if (dynamicDetail) {
    const kind =
      slug[0] === "services"
        ? "service"
        : slug[0] === "partners"
          ? "partner"
          : "guide";
    if (!docs.some((d) => d.kind === kind && d.slug === slug[1])) notFound();
  } else if (!isKnownRoute(slug)) notFound();
  if (!["request", "apply"].includes(slug[0]))
    return (
      <PublishedSite locale={locale} slug={slug} contents={docs} languagePaths={await languagePaths(slug.length === 2 ? docs.find(d => d.slug === slug[1] && d.kind === (slug[0] === "guides" ? "guide" : slug[0] === "services" ? "service" : "partner")) : undefined)} />
    );
  const { service, provider, project } = await searchParams;
  let catalogSelection: any;
  if (
    slug[0] === "request" &&
    (provider !== undefined || project !== undefined)
  ) {
    try {
      const source = parseCatalogSource({
        ...(provider !== undefined ? { provider } : {}),
        ...(project !== undefined ? { project } : {}),
      });
      const resolved = await resolveCatalogSource(
        await getPayload({ config }),
        locale,
        source,
      );
      catalogSelection = {
        source,
        summary: [resolved?.provider?.title, resolved?.project?.title]
          .filter(Boolean)
          .join(" · "),
      };
    } catch {
      catalogSelection = {
        error: coreText(locale, "The selected provider or project is unavailable or incompatible. Please choose again or remove the selection."),
      };
    }
  }
  return (
    <Site
      key={
        slug.join("/") + inquiryFormKey(locale, service, { provider, project })
      }
      locale={locale as Locale}
      slug={slug}
      initialService={service}
      catalogSelection={catalogSelection}
    />
  );
}
