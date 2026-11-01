import type { Locale } from "@/lib/locales";
import { publicText } from "@/lib/public-copy";
import { isCatalog, catalogPath } from "@/lib/catalog";
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
  languagePaths,
}: {
  locale: Locale;
  slug: string[];
  contents: ContentBody[];
  languagePaths?: Partial<Record<Locale, string | null>>;
}) {
  contents = contents.filter((d) => d.locale === locale);
  const section = slug[0] || "home";
  const kind =
    section === "services"
      ? "service"
      : section === "guides"
        ? "guide"
        : section === "partners" && slug[1]
          ? "partner"
          : "page";
  const detail = contents.find((d) => d.kind === kind && d.slug === (slug[1] || section));
  const services = contents.filter((d) => d.kind === "service");
  const guides = contents.filter((d) => d.kind === "guide");
  const faqs = contents.filter((d) => d.kind === "faq");
  const list = section === "services" ? services : guides;
  const empty = publicText(locale, "Content is being prepared. Please check back later.");
  return (
    <>
      <a className="skip-link" href="#main">
        {publicText(locale, "Skip to content")}
      </a>
      <Header locale={locale} languagePaths={languagePaths} />
      <main id="main">
        <nav className="section tight" aria-label={publicText(locale, "Service directories")}>
          <Link href={`/${locale}/providers`}>{publicText(locale, "Find providers")}</Link> ·{" "}
          <Link href={`/${locale}/services/projects`}>
            {publicText(locale, "Hua service projects")}
          </Link>
        </nav>
        {section === "home" ? (
          <>
            <section className="section">
              <span className="eyebrow">HUA COMPANION · SHANGHAI</span>
              <h1>{detail?.title || publicText(locale, "Your local companion in China.")}</h1>
              <p className="lead">{detail?.summary || empty}</p>
              {detail && (
                <ContentBlocks
                  quality={detail.qualityReview}
                  locale={locale}
                  blocks={detail.blocks}
                />
              )}
              <Link className="button" href={`/${locale}/request`}>
                {publicText(locale, "Plan your visit")} ↗
              </Link>
              <img
                src="/shanghai.svg"
                alt={publicText(locale, "Shanghai illustration")}
                style={{ width: "100%", maxHeight: 360, marginTop: 32 }}
              />
            </section>
            <section className="section tight">
              <h2>{publicText(locale, "Our services")}</h2>
              <Cards items={services} locale={locale} />
            </section>
            <section className="section tight">
              <h2>{publicText(locale, "Knowledge centre")}</h2>
              <Cards items={guides.slice(0, 3)} locale={locale} />
            </section>
          </>
        ) : !slug[1] && ["services", "guides"].includes(section) ? (
          <section className="section">
            <span className="eyebrow">HUA COMPANION</span>
            <h1>
              {section === "services"
                ? publicText(locale, "Our services")
                : publicText(locale, "Knowledge centre")}
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
                <nav aria-label={publicText(locale, "Breadcrumb")}>
                  <Link href={`/${locale}`}>{publicText(locale, "Home")}</Link> /{" "}
                  <Link href={`/${locale}/guides`}>{publicText(locale, "Knowledge centre")}</Link> /{" "}
                  <Link
                    href={`/${locale}/guides?section=${contentSections.find((s) => s.id === sectionFor(detail))?.key}`}
                  >
                    {contentSections.find((s) => s.id === sectionFor(detail))?.[locale]}
                  </Link>
                </nav>
              )}
              <h1>
                {detail?.title ||
                  (
                    {
                      about: publicText(locale, "About Hua Companion"),
                      contact: publicText(locale, "Contact"),
                      partners: publicText(locale, "Partners"),
                    } as Record<string, string>
                  )[section] ||
                  ""}
              </h1>
              <p className="lead">{detail?.summary || empty}</p>
              {detail && (
                <>
                  <ContentBlocks
                    quality={detail.qualityReview}
                    locale={locale}
                    blocks={detail.blocks}
                  />
                  {detail.kind === "guide" &&
                    contents.some((d) => d.catalog?.guideKeys.includes(detail.contentKey)) && (
                      <section>
                        <h2>{publicText(locale, "Related services")}</h2>
                        {contents
                          .filter(
                            (d) =>
                              isCatalog(d.kind) && d.catalog?.guideKeys.includes(detail.contentKey),
                          )
                          .map((d) => (
                            <p key={d.contentKey}>
                              <Link href={catalogPath(d)}>{d.title}</Link>
                            </p>
                          ))}
                      </section>
                    )}
                  {detail.publishedAt && (
                    <p>
                      {publicText(locale, "Published / updated: ")}
                      {detail.publishedAt.slice(0, 10)}
                    </p>
                  )}
                  {detail.author && (
                    <p>
                      {publicText(locale, "Author: ")}
                      {detail.author}
                    </p>
                  )}
                  {detail.sources.length > 0 && (
                    <div className="source-note">
                      <h2>{publicText(locale, "Sources")}</h2>
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
                  <Cards items={contents.filter((d) => d.kind === "partner")} locale={locale} />
                  <Link className="button" href={`/${locale}/apply`}>
                    {publicText(locale, "Apply to collaborate")}
                  </Link>
                </>
              )}
              {detail?.kind === "guide" && (
                <aside>
                  <h2>{publicText(locale, "More in this section")}</h2>
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
                        <Link href={`/${locale}/guides/${d.slug}`}>{d.title}</Link>
                      </p>
                    ))}
                </aside>
              )}
            </article>
            <aside className="side-card">
              <h2>{publicText(locale, "Tell us about your visit")}</h2>
              <Link className="button" href={`/${locale}/request`}>
                {publicText(locale, "Plan your visit")} ↗
              </Link>
            </aside>
          </section>
        )}
        {section === "home" && faqs.length > 0 && (
          <section className="section">
            <h2>{publicText(locale, "Frequently asked questions")}</h2>
            {faqs.map((f) => (
              <details key={f.contentKey} id={`faq-${f.contentKey}`}>
                <summary>{f.title}</summary>
                <ContentBlocks blocks={f.blocks} locale={locale} />
              </details>
            ))}
          </section>
        )}
      </main>
      <footer className="section">
        <p>
          <a href={`/api/public/content?locale=${locale}`}>
            {publicText(locale, "Published content data for agents")}
          </a>
        </p>
        <Link href={`/${locale}`}>华伴 · Hua Companion</Link>
        <p>© 2026 Hua Companion</p>
        <Link href={`/${locale}/privacy`}>{publicText(locale, "Privacy")}</Link> ·{" "}
        <Link href={`/${locale}/terms`}>{publicText(locale, "Service boundaries")}</Link>
      </footer>
    </>
  );
}
function Cards({ items, locale }: { items: ContentBody[]; locale: Locale }) {
  items = items.filter((d) => d.locale === locale);
  if (!items.length)
    return <p>{publicText(locale, "Content is being prepared. Please check back later.")}</p>;
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
            <span className="text-link">{publicText(locale, "Read more")} ↗</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
