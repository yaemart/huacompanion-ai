import { notFound } from "next/navigation";
import { Site } from "@/components/Site";
import { isKnownRoute, type Locale } from "@/lib/routes";
import {getPayload} from "payload";
import config from "@/payload.config";
import {listPublished} from "@/server/content/service";
import {PublishedSite} from "@/components/content/PublishedSite";
import {cache} from "react";
const content=cache(async(locale:string)=>listPublished(await getPayload({config}),locale));
export const dynamic="force-dynamic";
type Props = {
  params: Promise<{ locale: string; slug?: string[] }>;
  searchParams: Promise<{ service?: string }>;
};
export async function generateMetadata({ params }: Props) {
  const { locale, slug = [] } = await params;
  const l = locale === "zh" ? "zh" : "en";
  const docs=await content(l);
  const detail=docs.find(d=>d.kind===(slug[0]==='services'?'service':slug[0]==='guides'?'guide':'page')&&d.slug===(slug[1]||slug[0]||'home'));
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
    description: detail?.seoDescription || detail?.summary,
    title: `${detail?.seoTitle || detail?.title || titles[slug[0]]?.[l === "en" ? 0 : 1] || (l === "en" ? "Your local companion in China" : "您来中国，华伴同行")} | Hua Companion · 华伴`,
  };
}
export default async function Page({ params, searchParams }: Props) {
  const { locale, slug = [] } = await params;
  if (!["en", "zh"].includes(locale)) notFound();
  const docs=await content(locale);
  const dynamicDetail=slug.length===2&&['services','guides','partners'].includes(slug[0]);
  if(dynamicDetail){const kind=slug[0]==='services'?'service':slug[0]==='partners'?'partner':'guide';if(!docs.some(d=>d.kind===kind&&d.slug===slug[1]))notFound();}
  else if(!isKnownRoute(slug))notFound();
  if(!['request','apply'].includes(slug[0]))return <PublishedSite locale={locale as Locale} slug={slug} contents={docs}/>;
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
