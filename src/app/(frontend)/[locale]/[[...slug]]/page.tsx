import { LifestylePage } from "@/components/lifestyle/LifestylePage";
import { isLife } from "@/lib/lifestyle";
import { lifeText } from "@/lib/lifestyle-copy";
import { InstitutionPage } from "@/components/institutions/InstitutionPage";
import { ExhibitionPage } from "@/components/exhibitions/ExhibitionPage";
import { catalogCities } from "@/lib/catalog-options";
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
import { listPublished, contentTransaction } from "@/server/content/service";
import { PublishedSite } from "@/components/content/PublishedSite";
import { cache } from "react";
const content = cache(async (locale: string) =>
  listPublished(await getPayload({ config }), locale),
);
async function languagePaths(detail?: ContentBody) {
  if (!detail) return undefined;
  const all = (await Promise.all(locales.map((locale) => content(locale)))).flat();
  return translatedPaths(detail, all);
}
export const dynamic = "force-dynamic";
type Props = {
  params: Promise<{ locale: string; slug?: string[] }>;
  searchParams: Promise<{
    service?: string;
    provider?: string;
    providerRevision?: string;
    projectRevision?: string;
    homeService?: string;
    district?: string;
    equipment?: string;
    project?: string;
    exhibition?: string;
    institution?: string;
    life?: string;
    lifeKind?: string;
    lifeRevision?: string;
    date?: string;
    status?: string;
    cuisine?: string;
    scene?: string;
    budget?: string;
    type?: string;
    direction?: string;
    industry?: string;
    month?: string;
    period?: string;
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
    (slug[0] === "life" ? docs.find((d) => d.kind === slug[1] && d.slug === slug[2]) : undefined) ||
    (slug[0] === "institutions"
      ? docs.find((d) => d.kind === "institution" && d.slug === slug[1])
      : undefined) ||
    (slug[0] === "exhibitions"
      ? docs.find((d) => d.kind === "exhibition" && d.slug === slug[1])
      : undefined) ||
    docs.find(
      (d) =>
        d.kind === (slug[0] === "services" ? "service" : slug[0] === "guides" ? "guide" : "page") &&
        d.slug === (slug[1] || slug[0] || "home"),
    );
  const titles: Record<string, string> = {
    institutions: "Medical & wellness institutions",
    exhibitions: "Exhibitions",
    services: "Our services",
    guides: "Knowledge centre",
    partners: "Partner with us",
    about: "About us",
    contact: "Contact",
    request: "Plan your visit",
    apply: "Partner application",
    privacy: "Privacy notice",
    terms: "Service boundaries",
  };
  const title =
    (slug[0] === "life" ? detail?.seoTitle || detail?.title || lifeText(l, "title") : undefined) ||
    detail?.seoTitle ||
    detail?.title ||
    coreText(
      l,
      catalogKind
        ? catalogKind === "provider-profile"
          ? "Service providers"
          : "Hua service projects"
        : titles[slug[0]] || "Your local companion in China.",
    );
  return {
    ...(catalogKind || slug[0] === "exhibitions" || slug[0] === "institutions" || slug[0] === "life"
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
  if (slug[0] === "life") {
    if (slug.length !== 1 && (slug.length !== 3 || !isLife(slug[1]))) notFound();
    const detail = slug[2] ? docs.find((d) => d.kind === slug[1] && d.slug === slug[2]) : undefined;
    if (slug[2] && !detail) notFound();
    const raw = await searchParams;
    const query = Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
    );
    return (
      <LifestylePage
        items={docs}
        locale={locale}
        detail={detail}
        query={query}
        languagePaths={await languagePaths(detail)}
      />
    );
  }
  if (slug[0] === "institutions") {
    if (slug.length > 2) notFound();
    const detail = slug[1]
      ? docs.find((d) => d.kind === "institution" && d.slug === slug[1])
      : undefined;
    if (slug[1] && !detail) notFound();
    const rawQuery = await searchParams;
    const query = Object.fromEntries(
      Object.entries(rawQuery).map(([key, value]) => [
        key,
        Array.isArray(value) ? value[0] : value,
      ]),
    );
    return (
      <InstitutionPage
        locale={locale}
        items={docs}
        detail={detail}
        query={query}
        languagePaths={await languagePaths(detail)}
      />
    );
  }
  if (slug[0] === "exhibitions") {
    if (slug.length > 2) notFound();
    const detail = slug[1]
      ? docs.find((d) => d.kind === "exhibition" && d.slug === slug[1])
      : undefined;
    if (slug[1] && !detail) notFound();
    return (
      <ExhibitionPage
        locale={locale}
        items={docs}
        detail={detail}
        query={await searchParams}
        languagePaths={await languagePaths(detail)}
      />
    );
  }
  if (slug[0] === "providers" || (slug[0] === "services" && slug[1] === "projects")) {
    const kind = slug[0] === "providers" ? "provider-profile" : "service-project";
    const itemSlug = kind === "provider-profile" ? slug[1] : slug[2];
    if (slug.length > (kind === "provider-profile" ? 2 : 3)) notFound();
    const detail = itemSlug ? docs.find((d) => d.kind === kind && d.slug === itemSlug) : undefined;
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
  const dynamicDetail = slug.length === 2 && ["services", "guides", "partners"].includes(slug[0]);
  if (dynamicDetail) {
    const kind = slug[0] === "services" ? "service" : slug[0] === "partners" ? "partner" : "guide";
    if (!docs.some((d) => d.kind === kind && d.slug === slug[1])) notFound();
  } else if (!isKnownRoute(slug)) notFound();
  if (!["request", "apply"].includes(slug[0]))
    return (
      <PublishedSite
        locale={locale}
        slug={slug}
        contents={docs}
        languagePaths={await languagePaths(
          slug.length === 2
            ? docs.find(
                (d) =>
                  d.slug === slug[1] &&
                  d.kind ===
                    (slug[0] === "guides"
                      ? "guide"
                      : slug[0] === "services"
                        ? "service"
                        : "partner"),
              )
            : undefined,
        )}
      />
    );
  const {
    service,
    provider,
    project,
    exhibition,
    institution,
    life,
    lifeKind,
    lifeRevision,
    providerRevision,
    projectRevision,
  } = await searchParams;
  let catalogSelection: any;
  if (
    slug[0] === "request" &&
    (provider !== undefined ||
      project !== undefined ||
      exhibition !== undefined ||
      institution !== undefined ||
      life !== undefined)
  ) {
    try {
      const source = parseCatalogSource({
        ...(provider !== undefined
          ? {
              provider,
              ...(providerRevision ? { providerRevision: Number(providerRevision) } : {}),
            }
          : {}),
        ...(project !== undefined
          ? { project, ...(projectRevision ? { projectRevision: Number(projectRevision) } : {}) }
          : {}),
        ...(exhibition !== undefined ? { exhibition } : {}),
        ...(institution !== undefined ? { institution } : {}),
        ...(life !== undefined ? { life, lifeKind, lifeRevision: Number(lifeRevision) } : {}),
      });
      const payload = await getPayload({ config });
      const resolved = await contentTransaction(payload, (req) =>
        resolveCatalogSource(
          payload,
          locale,
          source,
          req,
          !!life ||
            service === "housekeeping" ||
            providerRevision !== undefined ||
            projectRevision !== undefined,
        ),
      );
      catalogSelection = {
        source: {
          ...source,
          ...(resolved?.provider ? { providerRevision: resolved.provider.revision } : {}),
          ...(resolved?.project ? { projectRevision: resolved.project.revision } : {}),
          ...(resolved?.life ? { lifeRevision: resolved.life.revision } : {}),
          ...(resolved?.exhibition ? { exhibitionRevision: resolved.exhibition.revision } : {}),
          ...(resolved?.institution ? { institutionRevision: resolved.institution.revision } : {}),
        },
        city: catalogCities.find(
          (c) =>
            c.code ===
            (resolved?.life?.city || resolved?.institution?.city || resolved?.exhibition?.city),
        )?.en,
        summary: [
          resolved?.life?.title,
          resolved?.life?.startAt,
          resolved?.institution?.title,
          resolved?.provider?.title,
          resolved?.project?.title,
          resolved?.exhibition?.title,
          resolved?.exhibition
            ? [resolved.exhibition.startDate, resolved.exhibition.endDate]
                .filter(Boolean)
                .join(" — ")
            : undefined,
        ]
          .filter(Boolean)
          .join(" · "),
      };
    } catch {
      catalogSelection = {
        error:
          life !== undefined
            ? lifeText(locale, "unavailable")
            : institution !== undefined
              ? {
                  zh: "所选机构已变更、暂停接待或与服务不匹配。请重新打开机构页面，或移除选择后提交一般咨询。",
                  en: "The institution is unavailable or incompatible. Reopen its page or remove the selection.",
                  es: "La institución no está disponible o no es compatible. Abre su página o elimina la selección.",
                  fr: "L’établissement est indisponible ou incompatible. Rouvrez sa page ou retirez la sélection.",
                  de: "Die Einrichtung ist nicht verfügbar oder nicht kompatibel. Öffnen Sie ihre Seite oder entfernen Sie die Auswahl.",
                  it: "La struttura non è disponibile o non è compatibile. Riapri la pagina o rimuovi la selezione.",
                  ar: "المؤسسة غير متاحة أو غير متوافقة. أعد فتح صفحتها أو أزل الاختيار.",
                }[locale]
              : coreText(
                  locale,
                  exhibition !== undefined
                    ? "The selected exhibition is unavailable, has changed, or does not match your service selection. Please reopen its page or remove the selection."
                    : "The selected provider or project is unavailable or incompatible. Please choose again or remove the selection.",
                ),
      };
    }
  }
  return (
    <Site
      key={
        slug.join("/") +
        inquiryFormKey(locale, service, {
          provider,
          project,
          providerRevision: catalogSelection?.source?.providerRevision,
          projectRevision: catalogSelection?.source?.projectRevision,
          exhibition,
          institution,
          life,
          lifeKind: lifeKind as "venue" | "activity" | undefined,
          lifeRevision: catalogSelection?.source?.lifeRevision,
          institutionRevision: catalogSelection?.source?.institutionRevision,
          exhibitionRevision: catalogSelection?.source?.exhibitionRevision,
        })
      }
      locale={locale as Locale}
      slug={slug}
      initialService={
        service || (life ? "travel" : institution ? "medical" : exhibition ? "business" : undefined)
      }
      catalogSelection={catalogSelection}
    />
  );
}
