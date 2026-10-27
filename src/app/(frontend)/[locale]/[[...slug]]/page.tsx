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
  const l = locale === "zh" ? "zh" : "en";
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
  const titles: Record<string, string[]> = {
    services: ["Our services", "来华服务"],
    guides: ["Knowledge centre", "知识中心"],
    partners: ["Partner with us", "合作伙伴"],
    about: ["About us", "关于华伴"],
    contact: ["Contact", "联系我们"],
    request: ["Plan your visit", "提交需求"],
    apply: ["Partner application", "合作申请"],
    privacy: ["Privacy notice", "隐私说明"],
    terms: ["Service boundaries", "服务边界"],
  };
  return {
    ...(catalogKind
      ? { alternates: { canonical: `/${l}/${slug.join("/")}` } }
      : {}),
    description: detail?.seoDescription || detail?.summary,
    title: `${detail?.seoTitle || detail?.title || (catalogKind ? (l === "zh" ? (catalogKind === "provider-profile" ? "服务商" : "华伴服务项目") : catalogKind === "provider-profile" ? "Service providers" : "Hua service projects") : undefined) || titles[slug[0]]?.[l === "en" ? 0 : 1] || (l === "en" ? "Your local companion in China" : "您来中国，华伴同行")} | Hua Companion · 华伴`,
  };
}
export default async function Page({ params, searchParams }: Props) {
  const { locale, slug = [] } = await params;
  if (!["en", "zh"].includes(locale)) notFound();
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
      <PublishedSite locale={locale as Locale} slug={slug} contents={docs} />
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
        error:
          locale === "zh"
            ? "所选服务商或项目已失效，或两者不匹配。请重新选择或移除选择。"
            : "The selected provider or project is unavailable or incompatible. Please choose again or remove the selection.",
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
