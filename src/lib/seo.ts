import { toolLocales, visaToolPath } from "./visa-search.ts";
import type { ContentBody } from "./content-model.ts";
import { locales, type Locale } from "./locales.ts";

export const seoPages = [
  { path: visaToolPath, label: "中国免签查询工具（仅中英文）" },
  { path: "", label: "首页" },
  { path: "services", label: "服务介绍目录" },
  { path: "services/projects", label: "服务项目目录" },
  { path: "providers", label: "服务商目录" },
  { path: "guides", label: "知识中心" },
  { path: "exhibitions", label: "展会目录" },
  { path: "institutions", label: "医疗康养目录" },
  { path: "life", label: "生活体验目录" },
  { path: "partners", label: "合作伙伴" },
  { path: "about", label: "关于华伴" },
  { path: "contact", label: "联系我们" },
  { path: "request", label: "客户咨询表单" },
  { path: "apply", label: "服务商申请表单" },
  { path: "privacy", label: "隐私说明" },
  { path: "terms", label: "服务边界" },
] as const;

export function indexingAllowed(env: Record<string, string | undefined> = process.env) {
  return env.APP_ENV === "production" && env.SEARCH_ENGINE_INDEXING === "true";
}

export function privateSearchPath(pathname: string) {
  return (
    /^\/(?:admin|api|content-preview)(?:\/|$)/.test(pathname) ||
    /^\/(?:content|support|business|workflow|quality)-center(?:\/|$)/.test(pathname) ||
    /^\/operations-overview(?:\/|$)/.test(pathname) ||
    /^\/[a-z]{2}\/(?:account|support)(?:\/|$)/.test(pathname)
  );
}

export function robotsContents(origin: string, index = indexingAllowed()) {
  const agentIndex = `# Content guide: ${origin}/llms.txt`;
  if (!index) return `User-agent: *\nDisallow: /\n${agentIndex}\n`;
  const privatePaths = [
    "/admin",
    "/api",
    "/content-preview",
    "/content-center",
    "/support-center",
    "/business-center",
    "/workflow-center",
    "/quality-center",
    "/operations-overview",
    ...locales.flatMap((locale) => [`/${locale}/account`, `/${locale}/support`]),
  ];
  return [
    "User-agent: *",
    "Allow: /",
    ...privatePaths.map((path) => `Disallow: ${path}`),
    `Sitemap: ${origin}/sitemap.xml`,
    agentIndex,
    "",
  ].join("\n");
}

export function publicContentPath(body: ContentBody) {
  const prefix: Partial<Record<ContentBody["kind"], string>> = {
    service: "services",
    guide: "guides",
    partner: "partners",
    "provider-profile": "providers",
    "service-project": "services/projects",
    exhibition: "exhibitions",
    institution: "institutions",
    venue: "life/venue",
    activity: "life/activity",
  };
  if (body.kind === "faq" || body.kind === "immigration-policy") return undefined;
  if (body.kind === "page") return `/${body.locale}${body.slug === "home" ? "" : `/${body.slug}`}`;
  return `/${body.locale}/${prefix[body.kind]}/${body.slug}`;
}

const xmlEscape = (value: string) =>
  value.replace(
    /[<>&"']/g,
    (character) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[character]!,
  );

export function sitemapXML(
  origin: string,
  published: ContentBody[],
  enabled: readonly Locale[] = locales,
  visaEnabled = false,
) {
  const groups = new Map<string, Map<Locale, { path: string; publishedAt?: string }>>();
  for (const page of seoPages) {
    const pageLocales = page.path === visaToolPath ? toolLocales(enabled, visaEnabled) : enabled;
    groups.set(
      `static:${page.path}`,
      new Map(
        pageLocales.map((locale) => [
          locale,
          {
            path: `/${locale}${page.path ? `/${page.path}` : ""}`,
          },
        ]),
      ),
    );
  }
  for (const body of published) {
    if (!enabled.includes(body.locale)) continue;
    const path = publicContentPath(body);
    if (!path) continue;
    const key =
      body.kind === "page"
        ? `static:${body.slug === "home" ? "" : body.slug}`
        : `${body.kind}:${body.contentKey}`;
    const group = groups.get(key) || new Map<Locale, { path: string; publishedAt?: string }>();
    group.set(body.locale, { path, publishedAt: body.publishedAt });
    groups.set(key, group);
  }
  const entries = new Map<string, string>([
    ["/llms.txt", `<url><loc>${xmlEscape(origin + "/llms.txt")}</loc></url>`],
  ]);
  for (const group of groups.values()) {
    const alternatives = [...group.entries()].map(
      ([locale, item]) =>
        `<xhtml:link rel="alternate" hreflang="${locale === "zh" ? "zh-CN" : locale}" href="${xmlEscape(origin + item.path)}"/>`,
    );
    const fallback = group.get("en") || group.values().next().value;
    if (fallback)
      alternatives.push(
        `<xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(origin + fallback.path)}"/>`,
      );
    for (const item of group.values()) {
      entries.set(
        item.path,
        `<url><loc>${xmlEscape(origin + item.path)}</loc>` +
          (item.publishedAt ? `<lastmod>${xmlEscape(item.publishedAt)}</lastmod>` : "") +
          alternatives.join("") +
          "</url>",
      );
    }
  }
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">' +
    [...entries.values()].join("") +
    "</urlset>"
  );
}

export type SeoFields = {
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoImage?: number | null;
};
export function contentMetadata(
  origin: string,
  path: string,
  content: SeoFields & { title?: string; summary?: string },
) {
  const title = `${content.seoTitle || content.title || "Hua Companion"} | Hua Companion · 华伴`;
  const description = content.seoDescription || content.summary || undefined;
  const images = content.seoImage ? [`${origin}/api/content-media/${content.seoImage}`] : [];
  return {
    title,
    description,
    alternates: { canonical: origin + path },
    openGraph: {
      title,
      description,
      url: origin + path,
      images,
      siteName: "Hua Companion · 华伴",
      type: "website" as const,
    },
    twitter: { card: "summary_large_image" as const, title, description, images },
  };
}
