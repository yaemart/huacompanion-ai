import Link from "next/link";
import { Header } from "../Header";
import { ContentBlocks } from "../content/ContentBlocks";
import type { ContentBody } from "@/lib/content-model";
import type { Locale } from "@/lib/locales";
import { catalogCities, cityLabel } from "@/lib/catalog-options";
import { effectiveExhibitionStatus, exhibitionPath, filterExhibitions } from "@/lib/exhibitions";
import {
  exhibitionIndustries,
  exhibitionIndustryLabel,
  exhibitionText,
} from "@/lib/exhibition-copy";

export type ExhibitionQuery = {
  city?: string;
  industry?: string;
  month?: string;
  q?: string;
  period?: string;
  page?: string;
};

export function ExhibitionPage({
  items,
  locale,
  detail,
  query = {},
  languagePaths,
}: {
  items: ContentBody[];
  locale: Locale;
  detail?: ContentBody;
  query?: ExhibitionQuery;
  languagePaths?: Partial<Record<Locale, string | null>>;
}) {
  const t = (key: Parameters<typeof exhibitionText>[1]) => exhibitionText(locale, key);
  const base = `/${locale}/exhibitions`;
  const localItems = items.filter((d) => d.locale === locale);
  const selected =
    detail?.locale === locale && detail.kind === "exhibition" && detail.exhibition
      ? detail
      : undefined;
  const period = query.period === "past" || query.period === "all" ? query.period : "upcoming";
  const filtered = filterExhibitions(localItems, { ...query, period });
  const count = Math.max(1, Math.ceil(filtered.length / 12));
  const page = Math.min(
    count,
    Math.max(1, Number.isSafeInteger(Number(query.page)) ? Number(query.page) : 1),
  );
  function pageHref(p: number) {
    const params = new URLSearchParams();
    for (const key of ["city", "industry", "month", "q", "period"] as const)
      if (query[key]) params.set(key, query[key]!);
    params.set("page", String(p));
    return `${base}?${params}`;
  }
  function enquiry(contentKey: string, project?: string) {
    return `/${locale}/request?${new URLSearchParams({ exhibition: contentKey, service: "business", ...(project ? { project, projectRevision: String(localItems.find((d) => d.kind === "service-project" && d.contentKey === project)?.publicationRevision || 0), ...(localItems.find((d) => d.kind === "service-project" && d.contentKey === project)?.catalog?.categories.includes("housekeeping") ? { service: "housekeeping" } : {}) } : {}) })}`;
  }
  const e = selected?.exhibition;
  const status = e ? effectiveExhibitionStatus(e) : undefined;
  const closed = status === "cancelled" || status === "ended";
  const canEnquire = !!selected && !closed && selected.acceptingInquiries !== false;
  const related = e
    ? localItems.filter((d) => d.kind === "service-project" && e.projectKeys.includes(d.contentKey))
    : [];
  // Only describe a dated event with a real location. Undated announcements remain ordinary pages.
  const schema =
    selected && e && e.startDate && e.endDate && e.venue && e.address
      ? {
          "@context": "https://schema.org",
          "@type": "Event",
          name: selected.title,
          description: selected.summary,
          startDate: e.startDate,
          endDate: e.endDate,
          url: exhibitionPath(selected),
          eventStatus:
            e.status === "cancelled"
              ? "https://schema.org/EventCancelled"
              : e.status === "postponed"
                ? "https://schema.org/EventPostponed"
                : e.status === "pending"
                  ? undefined
                  : "https://schema.org/EventScheduled",
          location: {
            "@type": "Place",
            name: e.venue,
            address: {
              "@type": "PostalAddress",
              streetAddress: e.address,
              addressLocality: cityLabel(e.city, locale),
              addressCountry: "CN",
            },
          },
          sameAs: e.officialURL || undefined,
        }
      : undefined;
  return (
    <>
      <a className="skip-link" href="#main">
        {t("skip")}
      </a>
      <Header locale={locale} languagePaths={languagePaths} />
      <main id="main" className="section exhibition-page" dir={locale === "ar" ? "rtl" : "ltr"}>
        {selected && e && status ? (
          <>
            <Link href={base}>← {t("title")}</Link>
            <div className="exhibition-heading">
              <span className={`exhibition-status exhibition-status-${status}`}>{t(status)}</span>
              <span>{cityLabel(e.city, locale)}</span>
            </div>
            <h1>{selected.title}</h1>
            <p className="lead">{selected.summary}</p>
            <dl className="catalog-details exhibition-details">
              {(
                [
                  [
                    t("date"),
                    e.startDate && e.endDate ? `${e.startDate} — ${e.endDate}` : t("unknown"),
                  ],
                  [t("status"), t(status)],
                  [t("edition"), e.edition],
                  [
                    t("industry"),
                    e.industries.map((i) => exhibitionIndustryLabel(i, locale)).join(" · "),
                  ],
                  [t("venue"), e.venue || t("unknown")],
                  [t("address"), e.address || t("unknown")],
                  [t("addressEn"), e.addressEn],
                  [t("audience"), e.audience || t("unknown")],
                  [t("exhibits"), e.exhibits || t("unknown")],
                  [t("admission"), e.admission || t("unknown")],
                  [t("verified"), e.verifiedAt || t("unknown")],
                  [t("unresolved"), e.unresolved],
                ] as [string, string][]
              )
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
            </dl>
            <div className="exhibition-actions">
              {e.officialURL && (
                <a href={e.officialURL} target="_blank" rel="noopener noreferrer">
                  {t("official")} ↗
                </a>
              )}
              {e.registrationURL && (
                <a href={e.registrationURL} target="_blank" rel="noopener noreferrer">
                  {t("registration")} ↗
                </a>
              )}
            </div>
            <ContentBlocks
              quality={selected.qualityReview}
              locale={locale}
              blocks={selected.blocks}
            />
            <section className="exhibition-inquiry">
              {canEnquire ? (
                <Link className="button" href={enquiry(selected.contentKey)}>
                  {t("enquire")} ↗
                </Link>
              ) : (
                <p role="status">{t(closed ? "unavailable" : "paused")}</p>
              )}
              <p>{t("disclaimer")}</p>
              <Link href={`/${locale}/request`}>{t("general")}</Link>
            </section>
            {related.length > 0 && (
              <section>
                <h2>{t("related")}</h2>
                <div className="guide-grid">
                  {related.map((project) => (
                    <article className="guide-card exhibition-card" key={project.contentKey}>
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
            <form action={base} method="get" className="catalog-filters exhibition-filters">
              <label>
                {t("search")}
                <input name="q" maxLength={200} defaultValue={query.q || ""} />
              </label>
              <label>
                {t("city")}
                <select name="city" defaultValue={query.city || ""}>
                  <option value="">{t("allCities")}</option>
                  {catalogCities.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c[locale]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("industry")}
                <select name="industry" defaultValue={query.industry || ""}>
                  <option value="">{t("allIndustries")}</option>
                  {exhibitionIndustries.map((i) => (
                    <option key={i} value={i}>
                      {exhibitionIndustryLabel(i, locale)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("month")}
                <input
                  type="month"
                  name="month"
                  defaultValue={/^\d{4}-\d{2}$/.test(query.month || "") ? query.month : ""}
                />
              </label>
              <label>
                {t("period")}
                <select name="period" defaultValue={period}>
                  <option value="upcoming">{t("upcoming")}</option>
                  <option value="past">{t("archive")}</option>
                  <option value="all">{t("all")}</option>
                </select>
              </label>
              <button className="button" type="submit">
                {t("filter")}
              </button>
              <Link href={base}>{t("reset")}</Link>
            </form>
            <p aria-live="polite">
              {t("results")}: {filtered.length}
            </p>
            <div className="guide-grid">
              {filtered.slice((page - 1) * 12, page * 12).map((d) => {
                const event = d.exhibition!;
                const state = effectiveExhibitionStatus(event);
                const cover = d.blocks.find((block) => block.type === "image");
                return (
                  <article className="guide-card exhibition-card" key={d.contentKey}>
                    {cover && (
                      <img
                        src={`/api/content-media/${cover.mediaId}`}
                        alt={cover.text || d.title}
                        loading="lazy"
                        style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover" }}
                      />
                    )}
                    <div className="exhibition-card-meta">
                      <span>{cityLabel(event.city, locale)}</span>
                      <span className={`exhibition-status exhibition-status-${state}`}>
                        {t(state)}
                      </span>
                    </div>
                    <h2>
                      <Link href={exhibitionPath(d)}>{d.title}</Link>
                    </h2>
                    <p>{d.summary}</p>
                    <p className="exhibition-date">
                      {event.startDate && event.endDate ? (
                        <>
                          <time dateTime={event.startDate}>{event.startDate}</time> —{" "}
                          <time dateTime={event.endDate}>{event.endDate}</time>
                        </>
                      ) : (
                        t("unknown")
                      )}
                    </p>
                    <p>{event.venue || t("unknown")}</p>
                    <p>
                      {event.industries.map((i) => exhibitionIndustryLabel(i, locale)).join(" · ")}
                    </p>
                    <Link href={exhibitionPath(d)}>{t("details")} →</Link>
                  </article>
                );
              })}
            </div>
            {!filtered.length && (
              <div className="exhibition-empty" role="status">
                <h2>{t("empty")}</h2>
                <div className="exhibition-actions">
                  <Link href={base}>{t("reset")}</Link>
                  <Link href={`/${locale}/request`}>{t("general")}</Link>
                </div>
              </div>
            )}
            {count > 1 && (
              <nav className="exhibition-pagination" aria-label={t("pagination")}>
                {page > 1 && <Link href={pageHref(page - 1)}>{t("previous")}</Link>}
                <span>
                  {page} / {count}
                </span>
                {page < count && <Link href={pageHref(page + 1)}>{t("next")}</Link>}
              </nav>
            )}
          </>
        )}
      </main>
      <footer className="footer">Hua Companion</footer>
    </>
  );
}
