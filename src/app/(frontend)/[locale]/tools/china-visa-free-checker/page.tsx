import { notFound } from "next/navigation";
import { getPayload } from "payload";
import config from "@/payload.config";
import { Header } from "@/components/Header";
import { PolicyTable } from "@/components/immigration/PolicyTable";
import { visaCheckerEnabled } from "@/lib/immigration-policy-flags";
import { policyPageCopy } from "@/lib/immigration-policy-page-copy";
import { buildPolicyTable } from "@/lib/immigration-policy-table";
import { contentMetadata } from "@/lib/seo";
import { listPublicPolicies } from "@/server/immigration/public";
import { isSiteLocale } from "@/server/site-config";
import "@/components/immigration/policy-table.css";

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
  return {
    ...contentMetadata(origin, `/${locale}${path}`, { title: c.title, summary: c.intro }),
    robots: { index: false, follow: false },
  };
}

export default async function VisaCheckerPage({ params }: Props) {
  const locale = await pageLocale(params);
  const c = policyPageCopy[locale];
  const policies = await listPublicPolicies(await getPayload({ config }), locale);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
  const rows = buildPolicyTable(policies, today);
  return (
    <>
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
          <a href={`/en${path}`} lang="en" aria-current={locale === "en" ? "page" : undefined}>
            English
          </a>
          <a href={`/zh${path}`} lang="zh-CN" aria-current={locale === "zh" ? "page" : undefined}>
            中文
          </a>
        </nav>
        <h1>{c.title}</h1>
        <p className="lead">{c.intro}</p>
        <p>
          {c.referenceDate} <time dateTime={today}>{today}</time>
        </p>
        <PolicyTable rows={rows} locale={locale} />
        <aside className="policy-disclaimer">
          <p>{c.disclaimer}</p>
        </aside>
        <div className="policy-next-steps">
          <a href={`/${locale}/guides`}>{c.guide}</a>
          <a className="button" href={`/${locale}/request`}>
            {c.service} ↗
          </a>
        </div>
      </main>
    </>
  );
}
