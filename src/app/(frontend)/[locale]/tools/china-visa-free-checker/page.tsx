import { PublicPage } from "@/components/content/PublicPage";
import { pageSEO } from "@/server/seo";
import { toolAlternates, toolLocales, visaToolPath } from "@/lib/visa-search";
import { getSiteLocales } from "@/server/site-config";
import { notFound } from "next/navigation";
import { getPayload } from "payload";
import config from "@/payload.config";
import { Header } from "@/components/Header";
import { PolicyTable } from "@/components/immigration/PolicyTable";
import { PolicyFAQ } from "@/components/immigration/PolicyFAQ";
import { selectPolicyFAQs } from "@/lib/immigration-policy-faq";
import { PolicyQuery } from "@/components/immigration/PolicyQuery";
import { selectPolicyVisaGuide } from "@/lib/immigration-policy-browser";
import { listPublished } from "@/server/content/service";
import { visaCheckerEnabled } from "@/lib/immigration-policy-flags";
import { policyPageCopy } from "@/lib/immigration-policy-page-copy";
import { buildPolicyTable } from "@/lib/immigration-policy-table";
import { contentMetadata, indexingAllowed } from "@/lib/seo";
import { listPublicPolicies } from "@/server/immigration/public";
import { isSiteLocale } from "@/server/site-config";
import { subscriptionRequestConfig } from "@/server/subscription-readiness";
import { policyMailReference } from "@/server/policy-subscription";
import "@/components/immigration/policy-table.css";
import "@/components/immigration/policy-query.css";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string }> };
const path = "/tools/china-visa-free-checker";
async function pageLocale(params: Props["params"]) {
  const { locale } = await params;
  if (!visaCheckerEnabled() || (locale !== "en" && locale !== "zh") || !isSiteLocale(locale))
    notFound();
  return locale;
}

export async function generateMetadata({ params }: Props) {
  const locale = await pageLocale(params);
  const c = policyPageCopy[locale];
  const origin = new URL(process.env.APP_URL || "http://127.0.0.1:3000").origin;
  const seo = await pageSEO(await getPayload({ config }), locale, visaToolPath);
  const meta = contentMetadata(origin, `/${locale}${path}`, {
    title: c.title,
    summary: c.intro,
    ...seo,
  });
  const images = meta.openGraph.images.length
    ? meta.openGraph.images
    : [`${origin}/visa-checker-share.png`];
  return {
    ...meta,
    openGraph: { ...meta.openGraph, images },
    twitter: { ...meta.twitter, images },
    alternates: { ...meta.alternates, languages: toolAlternates(origin, getSiteLocales(), true) },
    robots: { index: indexingAllowed(), follow: indexingAllowed() },
  };
}

export default async function VisaCheckerPage({ params }: Props) {
  const locale = await pageLocale(params);
  const c = policyPageCopy[locale];
  const payload = await getPayload({ config });
  const policies = await listPublicPolicies(payload, locale);
  const guideKey = process.env.VISA_GUIDE_CONTENT_KEY;
  const faqKeys = process.env.VISA_FAQ_CONTENT_KEYS;
  const subscription = subscriptionRequestConfig();
  const published =
    subscription || guideKey?.trim() || faqKeys?.trim() ? await listPublished(payload, locale) : [];
  const policyEmail =
    subscription &&
    published.some((doc) => doc.kind === "page" && doc.slug === "privacy") &&
    (await payload.findGlobal({ slug: "workflow-settings" }).catch(() => null))?.emailEnabled
      ? {
          privacyVersion: subscription.privacyVersion,
          references: policies.map((policy) => policyMailReference(locale, policy)),
        }
      : undefined;
  const visaGuide = selectPolicyVisaGuide(published, locale, guideKey);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
  const rows = buildPolicyTable(policies, today);
  return (
    <PublicPage locale={locale} subscriptionPath={`/${locale}${path}`}>
      <a className="skip-link" href="#policy-main">
        {c.skip}
      </a>
      <Header
        locale={locale}
        languagePaths={{
          en: `/en${path}`,
          zh: `/zh${path}`,
          es: null,
          fr: null,
          de: null,
          it: null,
          ar: null,
        }}
      />
      <main id="policy-main" className="section policy-reference" data-policy-reference>
        <nav className="policy-language-links" aria-label={c.language}>
          {toolLocales(getSiteLocales(), true).includes("en") && (
            <a href={`/en${path}`} lang="en" aria-current={locale === "en" ? "page" : undefined}>
              English
            </a>
          )}
          {toolLocales(getSiteLocales(), true).includes("zh") && (
            <a href={`/zh${path}`} lang="zh-CN" aria-current={locale === "zh" ? "page" : undefined}>
              中文
            </a>
          )}
        </nav>
        <h1>{c.title}</h1>
        <p className="lead">{c.intro}</p>
        <p>
          {c.referenceDate} <time dateTime={today}>{today}</time>
        </p>
        <PolicyQuery
          locale={locale}
          policies={policies}
          verifiedOnOrBefore={today}
          visaGuide={visaGuide}
          policyEmail={policyEmail}
        >
          <PolicyTable rows={rows} locale={locale} />
        </PolicyQuery>
        <PolicyFAQ items={selectPolicyFAQs(published, locale, faqKeys, today)} locale={locale} />
        <aside className="policy-disclaimer">
          <p>{c.disclaimer}</p>
        </aside>
        <div className="policy-next-steps">
          <a href={visaGuide?.href || `/${locale}/guides`}>{visaGuide?.title || c.guide}</a>
          <a className="button" href={`/${locale}/request`}>
            {c.service} ↗
          </a>
        </div>
      </main>
    </PublicPage>
  );
}
