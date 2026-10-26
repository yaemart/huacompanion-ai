import { notFound } from "next/navigation";
import { Site } from "@/components/Site";
import { isKnownRoute, type Locale } from "@/lib/routes";
import { services, guides } from "@/lib/content";
type Props = {
  params: Promise<{ locale: string; slug?: string[] }>;
  searchParams: Promise<{ service?: string }>;
};
export async function generateMetadata({ params }: Props) {
  const { locale, slug = [] } = await params;
  const l = locale === "zh" ? "zh" : "en";
  const detail =
    slug[0] === "services"
      ? services.find((s) => s.slug === slug[1])
      : slug[0] === "guides"
        ? guides.find((g) => g.slug === slug[1])
        : undefined;
  const titles: Record<string, string[]> = {
    services: ["Our services", "来华服务"],
    guides: ["China guide", "来华指南"],
    partners: ["Partner with us", "合作伙伴"],
    about: ["About us", "关于华伴"],
    contact: ["Contact", "联系我们"],
    request: ["Plan your visit", "提交需求"],
    apply: ["Partner application", "合作申请"],
    privacy: ["Privacy notice", "隐私说明"],
    terms: ["Service boundaries", "服务边界"],
  };
  return {
    title: `${detail?.title[l] || titles[slug[0]]?.[l === "en" ? 0 : 1] || (l === "en" ? "Your local companion in China" : "您来中国，华伴同行")} | Hua Companion · 华伴`,
  };
}
export default async function Page({ params, searchParams }: Props) {
  const { locale, slug = [] } = await params;
  if (!["en", "zh"].includes(locale) || !isKnownRoute(slug)) notFound();
  const { service } = await searchParams;
  return (
    <Site
      key={`${locale}/${slug.join("/")}`}
      locale={locale as Locale}
      slug={slug}
      initialService={service}
    />
  );
}
