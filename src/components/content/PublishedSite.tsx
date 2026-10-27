import Link from "next/link";
import { contentSections, sectionFor } from "@/lib/content-sections";
import { PublishedGuides } from "./PublishedGuides";
import { Header } from "../Header";
import { ContentBlocks } from "./ContentBlocks";
import type { ContentBody } from "@/lib/content-model";
export function PublishedSite({
  locale,
  slug,
  contents,
}: {
  locale: "en" | "zh";
  slug: string[];
  contents: ContentBody[];
}) {
  const zh = locale === "zh";
  const section = slug[0] || "home";
  const kind =
    section === "services"
      ? "service"
      : section === "guides"
        ? "guide"
        : section === "partners" && slug[1]
          ? "partner"
          : "page";
  const detail = contents.find(
    (d) => d.kind === kind && d.slug === (slug[1] || section),
  );
  const services = contents.filter((d) => d.kind === "service");
  const guides = contents.filter((d) => d.kind === "guide");
  const faqs = contents.filter((d) => d.kind === "faq");
  const list = section === "services" ? services : guides;
  const empty = zh
    ? "内容正在整理中，请稍后查看。"
    : "Content is being prepared. Please check back later.";
  return (
    <>
      <a className="skip-link" href="#main">
        {zh ? "跳到正文" : "Skip to content"}
      </a>
      <Header locale={locale} />
      <main id="main">
        {section === "home" ? (
          <>
            <section className="section">
              <span className="eyebrow">HUA COMPANION · SHANGHAI</span>
              <h1>
                {detail?.title ||
                  (zh
                    ? "您来中国，华伴同行。"
                    : "Your local companion in China.")}
              </h1>
              <p className="lead">{detail?.summary || empty}</p>
              {detail && <ContentBlocks blocks={detail.blocks} />}
              <Link className="button" href={`/${locale}/request`}>
                {zh ? "提交服务需求" : "Plan your visit"} ↗
              </Link>
              <img
                src="/shanghai.svg"
                alt={zh ? "上海城市插画" : "Shanghai illustration"}
                style={{ width: "100%", maxHeight: 360, marginTop: 32 }}
              />
            </section>
            <section className="section tight">
              <h2>{zh ? "来华服务" : "Our services"}</h2>
              <Cards items={services} locale={locale} />
            </section>
            <section className="section tight">
              <h2>{zh ? "知识中心" : "Knowledge centre"}</h2>
              <Cards items={guides.slice(0, 3)} locale={locale} />
            </section>
          </>
        ) : !slug[1] && ["services", "guides"].includes(section) ? (
          <section className="section">
            <span className="eyebrow">HUA COMPANION</span>
            <h1>
              {section === "services"
                ? zh
                  ? "来华服务"
                  : "Our services"
                : zh
                  ? "知识中心"
                  : "Knowledge centre"}
            </h1>
            {section === "guides" ? (
              <PublishedGuides items={guides} locale={locale} />
            ) : list.length ? (
              <Cards items={list} locale={locale} />
            ) : (
              <p>{empty}</p>
            )}
          </section>
        ) : (
          <section className="section article-layout">
            <article className="article">
              {detail?.kind === "guide" && (
                <nav aria-label={zh ? "当前位置" : "Breadcrumb"}>
                  <Link href={`/${locale}`}>{zh ? "首页" : "Home"}</Link> /{" "}
                  <Link href={`/${locale}/guides`}>
                    {zh ? "知识中心" : "Knowledge centre"}
                  </Link>{" "}
                  /{" "}
                  <Link
                    href={`/${locale}/guides?section=${contentSections.find((s) => s.id === sectionFor(detail))?.key}`}
                  >
                    {
                      contentSections.find(
                        (s) => s.id === sectionFor(detail),
                      )?.[locale]
                    }
                  </Link>
                </nav>
              )}
              <h1>
                {detail?.title ||
                  (
                    {
                      about: zh ? "关于华伴" : "About Hua Companion",
                      contact: zh ? "联系我们" : "Contact",
                      partners: zh ? "合作伙伴" : "Partners",
                    } as Record<string, string>
                  )[section] ||
                  ""}
              </h1>
              <p className="lead">{detail?.summary || empty}</p>
              {detail && (
                <>
                  <ContentBlocks blocks={detail.blocks} />
                  {detail.publishedAt && (
                    <p>
                      {zh ? "发布／更新于：" : "Published / updated: "}
                      {detail.publishedAt.slice(0, 10)}
                    </p>
                  )}
                  {detail.author && (
                    <p>
                      {zh ? "作者：" : "Author: "}
                      {detail.author}
                    </p>
                  )}
                  {detail.sources.length > 0 && (
                    <div className="source-note">
                      <h2>{zh ? "资料来源" : "Sources"}</h2>
                      {detail.sources.map((s) => (
                        <p key={s.id}>
                          <a href={s.url} rel="noopener noreferrer">
                            {s.title}
                          </a>
                          {s.checkedAt && ` · ${s.checkedAt}`}
                        </p>
                      ))}
                    </div>
                  )}
                </>
              )}
              {section === "partners" && (
                <>
                  <Cards
                    items={contents.filter((d) => d.kind === "partner")}
                    locale={locale}
                  />
                  <Link className="button" href={`/${locale}/apply`}>
                    {zh ? "申请合作" : "Apply to collaborate"}
                  </Link>
                </>
              )}
              {detail?.kind === "guide" && (
                <aside>
                  <h2>{zh ? "同板块延伸阅读" : "More in this section"}</h2>
                  {contents
                    .filter(
                      (d) =>
                        d.kind === "guide" &&
                        d.contentKey !== detail.contentKey &&
                        sectionFor(d) === sectionFor(detail),
                    )
                    .slice(0, 4)
                    .map((d) => (
                      <p key={d.contentKey}>
                        <Link href={`/${locale}/guides/${d.slug}`}>
                          {d.title}
                        </Link>
                      </p>
                    ))}
                </aside>
              )}
            </article>
            <aside className="side-card">
              <h2>{zh ? "从您的计划说起" : "Tell us about your visit"}</h2>
              <Link className="button" href={`/${locale}/request`}>
                {zh ? "提交需求" : "Plan your visit"} ↗
              </Link>
            </aside>
          </section>
        )}
        {section === "home" && faqs.length > 0 && (
          <section className="section">
            <h2>{zh ? "常见问题" : "Frequently asked questions"}</h2>
            {faqs.map((f) => (
              <details key={f.contentKey} id={`faq-${f.contentKey}`}>
                <summary>{f.title}</summary>
                <ContentBlocks blocks={f.blocks} />
              </details>
            ))}
          </section>
        )}
      </main>
      <footer className="section">
        <p>
          <a href={`/api/public/content?locale=${locale}`}>
            {zh
              ? "公开内容数据（供 Agent 读取）"
              : "Published content data for agents"}
          </a>
        </p>
        <Link href={`/${locale}`}>华伴 · Hua Companion</Link>
        <p>© 2026 Hua Companion</p>
        <Link href={`/${locale}/privacy`}>
          {zh ? "隐私说明" : "Privacy"}
        </Link> ·{" "}
        <Link href={`/${locale}/terms`}>
          {zh ? "服务边界" : "Service boundaries"}
        </Link>
      </footer>
    </>
  );
}
function Cards({ items, locale }: { items: ContentBody[]; locale: string }) {
  return (
    <div className="guide-grid">
      {items.map((d) => (
        <Link
          className="guide-card"
          key={d.contentKey}
          href={`/${locale}/${d.kind === "service" ? "services" : d.kind === "partner" ? "partners" : "guides"}/${d.slug}`}
        >
          <div className="guide-copy">
            <h3>{d.title}</h3>
            <p>{d.summary}</p>
            <span className="text-link">
              {locale === "zh" ? "了解更多" : "Read more"} ↗
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
