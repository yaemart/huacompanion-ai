import Link from "next/link";
import { Header } from "../Header";
import { ContentBlocks } from "../content/ContentBlocks";
import type { ContentBody } from "@/lib/content-model";
import { locales, localeNames, type Locale } from "@/lib/locales";
import { catalogCities, cityLabel } from "@/lib/catalog-options";
import { filterInstitutions, institutionPath } from "@/lib/institutions";
import { institutionText, type InstitutionCopyKey } from "@/lib/institution-copy";

export type InstitutionQuery = {
  city?: string;
  type?: string;
  language?: string;
  q?: string;
  direction?: string;
  page?: string;
};
export function InstitutionPage({
  items,
  locale,
  detail,
  query = {},
  languagePaths,
}: {
  items: ContentBody[];
  locale: Locale;
  detail?: ContentBody;
  query?: InstitutionQuery;
  languagePaths?: Partial<Record<Locale, string | null>>;
}) {
  const t = (key: InstitutionCopyKey) => institutionText(locale, key);
  const base = `/${locale}/institutions`;
  const localItems = items.filter((d) => d.locale === locale);
  const selected =
    detail?.locale === locale && detail.kind === "institution" && detail.institution
      ? detail
      : undefined;
  const institution = selected?.institution;
  const filtered = filterInstitutions(localItems, query).filter(
    (d) =>
      !query.direction ||
      d.institution!.directions.toLowerCase().includes(query.direction.trim().toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 12));
  const page = Math.min(
    pages,
    Math.max(1, Number.isSafeInteger(Number(query.page)) ? Number(query.page) : 1),
  );
  const canEnquire =
    !!selected &&
    institution?.foreignAcceptance === "confirmed" &&
    selected.acceptingInquiries !== false;
  const related = institution
    ? localItems.filter(
        (d) => d.kind === "service-project" && institution.projectKeys.includes(d.contentKey),
      )
    : [];
  function enquiry(key: string, project?: string) {
    return (
      `/${locale}/request?` +
      new URLSearchParams({
        institution: key,
        ...(project
          ? {
              project,
              projectRevision: String(
                localItems.find((d) => d.kind === "service-project" && d.contentKey === project)
                  ?.publicationRevision || 0,
              ),
              ...(localItems
                .find((d) => d.kind === "service-project" && d.contentKey === project)
                ?.catalog?.categories.includes("housekeeping")
                ? { service: "housekeeping" }
                : {}),
            }
          : {}),
      })
    );
  }
  function pageHref(value: number) {
    const params = new URLSearchParams();
    for (const key of ["city", "type", "language", "q", "direction"] as const)
      if (query[key]) params.set(key, query[key]!);
    params.set("page", String(value));
    return `${base}?${params}`;
  }
  // A sourced directory entry describes a place, without ratings, accreditation or treatment claims.
  const schema =
    selected && institution
      ? {
          "@context": "https://schema.org",
          "@type": "Place",
          name: selected.title,
          url: institutionPath(selected),
          sameAs: institution.officialURL || undefined,
          address: {
            "@type": "PostalAddress",
            streetAddress: institution.address,
            addressLocality: cityLabel(institution.city, locale),
            addressCountry: "CN",
          },
        }
      : undefined;
  return (
    <>
      <a className="skip-link" href="#main">
        {t("skip")}
      </a>
      <Header locale={locale} languagePaths={languagePaths} />
      <main id="main" className="section institution-page" dir={locale === "ar" ? "rtl" : "ltr"}>
        {selected && institution ? (
          <>
            <Link href={base}>← {t("title")}</Link>
            <div className="institution-meta">
              <span>{cityLabel(institution.city, locale)}</span>
              <span>{t(institution.type as InstitutionCopyKey)}</span>
              <span
                className={`institution-status institution-status-${institution.foreignAcceptance}`}
              >
                {t(institution.foreignAcceptance as InstitutionCopyKey)}
              </span>
            </div>
            <h1>{selected.title}</h1>
            <p className="lead">{selected.summary}</p>
            <dl className="catalog-details">
              {(
                [
                  "address",
                  "addressEn",
                  "directions",
                  "audience",
                  "appointment",
                  "preparation",
                  "fees",
                  "acceptanceConditions",
                  "interpretation",
                  "qualification",
                  "unresolved",
                ] as const
              ).map((key) => (
                <div key={key}>
                  <dt>{t(key)}</dt>
                  <dd>{institution[key] || t("unknown")}</dd>
                </div>
              ))}
              <div>
                <dt>{t("language")}</dt>
                <dd>
                  {institution.languages.length
                    ? institution.languages
                        .map((code) => localeNames[code as Locale] || code)
                        .join(" · ")
                    : t("unknown")}
                </dd>
              </div>
              <div>
                <dt>{t("verified")}</dt>
                <dd>{institution.verifiedAt || t("unknown")}</dd>
              </div>
            </dl>
            {institution.officialURL && (
              <p>
                <a href={institution.officialURL} target="_blank" rel="noopener noreferrer">
                  {t("official")} ↗
                </a>
              </p>
            )}
            <ContentBlocks
              quality={selected.qualityReview}
              locale={locale}
              blocks={selected.blocks}
            />
            {selected.sources.length > 0 && (
              <section className="institution-sources">
                <h2>{t("sources")}</h2>
                <ul>
                  {selected.sources.map((source) => (
                    <li key={source.id}>
                      <a href={source.url} target="_blank" rel="noopener noreferrer">
                        {source.title} ↗
                      </a>
                      {source.checkedAt && (
                        <>
                          {" "}
                          · {t("verified")}:{" "}
                          <time dateTime={source.checkedAt}>{source.checkedAt}</time>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section className="institution-enquiry">
              {canEnquire ? (
                <Link className="button" href={enquiry(selected.contentKey)}>
                  {t("enquire")} ↗
                </Link>
              ) : (
                <p role="status">
                  {t(institution.foreignAcceptance === "pending" ? "pending" : "paused")}
                </p>
              )}
              <p>{t("receptionNote")}</p>
              <p>{t("disclaimer")}</p>
              <Link href={`/${locale}/request`}>{t("general")}</Link>
            </section>
            {!!related.length && (
              <section>
                <h2>{t("related")}</h2>
                <div className="guide-grid">
                  {related.map((project) => (
                    <article className="guide-card catalog-card" key={project.contentKey}>
                      <h3>
                        <Link href={`/${locale}/services/projects/${project.slug}`}>
                          {project.title}
                        </Link>
                      </h3>
                      <p>{project.summary}</p>
                      <Link href={`/${locale}/services/projects/${project.slug}`}>
                        {t("project")} →
                      </Link>
                      {canEnquire && project.acceptingInquiries && (
                        <p>
                          <Link href={enquiry(selected.contentKey, project.contentKey)}>
                            {t("projectEnquire")} ↗
                          </Link>
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            )}
            {schema && (
              <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                  __html: JSON.stringify(schema).replace(/</g, "\\u003c"),
                }}
              />
            )}
          </>
        ) : (
          <>
            <span className="eyebrow">HUA COMPANION</span>
            <h1>{t("title")}</h1>
            <p className="lead">{t("intro")}</p>
            <form action={base} method="get" className="catalog-filters institution-filters">
              <label>
                {t("search")}
                <input name="q" maxLength={200} defaultValue={query.q || ""} />
              </label>
              <label>
                {t("city")}
                <select name="city" defaultValue={query.city || ""}>
                  <option value="">{t("allCities")}</option>
                  {catalogCities.map((city) => (
                    <option key={city.code} value={city.code}>
                      {city[locale]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("type")}
                <select name="type" defaultValue={query.type || ""}>
                  <option value="">{t("allTypes")}</option>
                  {(["medical", "rehabilitation", "wellness"] as const).map((type) => (
                    <option key={type} value={type}>
                      {t(type)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("language")}
                <select name="language" defaultValue={query.language || ""}>
                  <option value="">{t("allLanguages")}</option>
                  {locales.map((code) => (
                    <option key={code} value={code}>
                      {localeNames[code]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("directionSearch")}
                <input name="direction" maxLength={200} defaultValue={query.direction || ""} />
              </label>
              <button type="submit" className="button">
                {t("filter")}
              </button>
              <Link href={base}>{t("reset")}</Link>
            </form>
            <p>{t("receptionNote")}</p>
            <p aria-live="polite">
              {t("results")}: {filtered.length}
            </p>
            <div className="guide-grid">
              {filtered.slice((page - 1) * 12, page * 12).map((item) => {
                const data = item.institution!;
                return (
                  <article
                    className="guide-card catalog-card institution-card"
                    key={item.contentKey}
                  >
                    <div className="institution-meta">
                      <span>{cityLabel(data.city, locale)}</span>
                      <span>{t(data.type as InstitutionCopyKey)}</span>
                    </div>
                    <h2>
                      <Link href={institutionPath(item)}>{item.title}</Link>
                    </h2>
                    <p>{item.summary}</p>
                    <p>{data.directions}</p>
                    <span
                      className={`institution-status institution-status-${data.foreignAcceptance}`}
                    >
                      {t(data.foreignAcceptance as InstitutionCopyKey)}
                    </span>
                    <p>
                      {t("language")}:{" "}
                      {data.languages.length
                        ? data.languages
                            .map((code) => localeNames[code as Locale] || code)
                            .join(" · ")
                        : t("unknown")}
                    </p>
                    <Link href={institutionPath(item)}>{t("details")} →</Link>
                  </article>
                );
              })}
            </div>
            {!filtered.length && (
              <div className="institution-enquiry" role="status">
                <h2>{t("empty")}</h2>
                <Link href={base}>{t("reset")}</Link> ·{" "}
                <Link href={`/${locale}/request`}>{t("general")}</Link>
              </div>
            )}
            {pages > 1 && (
              <nav className="institution-pagination" aria-label={t("pagination")}>
                {page > 1 && <Link href={pageHref(page - 1)}>{t("previous")}</Link>}
                <span>
                  {page} / {pages}
                </span>
                {page < pages && <Link href={pageHref(page + 1)}>{t("next")}</Link>}
              </nav>
            )}
          </>
        )}
      </main>
    </>
  );
}
