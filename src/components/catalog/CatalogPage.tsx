import { HousekeepingDetails } from "./HousekeepingDetails";
import { homeText } from "@/lib/housekeeping-copy";
import { homeServices } from "@/lib/housekeeping";
import type { Locale } from "@/lib/locales";
import { publicText, resultText } from "@/lib/public-copy";
import { catalogCities, catalogLanguages, cityLabel, languageLabel } from "@/lib/catalog-options";
import Link from "next/link";
import { Header } from "../Header";
import { ContentBlocks } from "../content/ContentBlocks";
import type { ContentBody } from "@/lib/content-model";
import { catalogFilter, catalogPath, priceText } from "@/lib/catalog";
import { services } from "@/lib/content";
export type CatalogQuery = {
  category?: string;
  homeService?: string;
  district?: string;
  equipment?: string;
  city?: string;
  language?: string;
  q?: string;
  page?: string;
};
export function CatalogPage({
  items,
  locale,
  kind,
  detail,
  query = {},
  languagePaths,
}: {
  items: ContentBody[];
  locale: Locale;
  kind: string;
  detail?: ContentBody;
  query?: CatalogQuery;
  languagePaths?: Partial<Record<Locale, string | null>>;
}) {
  items = items.filter((d) => d.locale === locale);
  detail = detail?.locale === locale ? detail : undefined;
  const title =
    kind === "provider-profile"
      ? publicText(locale, "Service providers")
      : publicText(locale, "Hua service projects");
  const base = `/${locale}/${kind === "provider-profile" ? "providers" : "services/projects"}`;
  const candidates = items.filter((d) => d.kind === kind);
  const filtered = catalogFilter(candidates, query);
  const page = Math.max(1, Number.isSafeInteger(Number(query.page)) ? Number(query.page) : 1);
  const count = Math.ceil(filtered.length / 12);
  function href(p: number) {
    const q = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v && k !== "page") q.set(k, v);
    });
    q.set("page", String(p));
    return base + "?" + q;
  }
  return (
    <>
      <a className="skip-link" href="#main">
        {publicText(locale, "Skip to content")}
      </a>
      <Header locale={locale} languagePaths={languagePaths} />
      <main id="main" className="section">
        <nav
          aria-label={publicText(locale, "Service navigation")}
          style={{
            display: "flex",
            gap: 20,
            flexWrap: "wrap",
            marginBottom: 30,
          }}
        >
          <Link href={`/${locale}/services`}>{publicText(locale, "Service categories")}</Link>
          <Link href={`/${locale}/providers`}>{publicText(locale, "Providers")}</Link>
          <Link href={`/${locale}/services/projects`}>{publicText(locale, "Hua projects")}</Link>
        </nav>
        {detail ? (
          <>
            <Link href={base}>← {title}</Link>
            <h1>{detail.title}</h1>
            <p className="lead">{detail.summary}</p>
            <CatalogDetails detail={detail} locale={locale} />
            {detail.catalog?.housekeeping && (
              <HousekeepingDetails value={detail.catalog.housekeeping} locale={locale} />
            )}
            <ContentBlocks quality={detail.qualityReview} locale={locale} blocks={detail.blocks} />
            <p>
              {publicText(locale, "Updated")}: {detail.publishedAt?.slice(0, 10)}
            </p>
            {detail.acceptingInquiries ? (
              <Link
                className="button"
                href={`/${locale}/request?${new URLSearchParams({ [kind === "provider-profile" ? "provider" : "project"]: detail.contentKey, service: detail.catalog!.categories.includes("housekeeping") ? "housekeeping" : detail.catalog!.categories[0], ...(detail.catalog!.categories.includes("housekeeping") ? { [kind === "provider-profile" ? "providerRevision" : "projectRevision"]: String(detail.publicationRevision) } : {}) })}`}
              >
                {publicText(locale, "Enquire through Hua")} ↗
              </Link>
            ) : (
              <p role="status">
                {publicText(
                  locale,
                  "Enquiries for this arrangement are paused while fulfilment is reviewed.",
                )}
              </p>
            )}
            <p>
              {publicText(
                locale,
                "Hua handles all enquiries. Submission does not confirm a booking, availability or final price.",
              )}
            </p>
            <Related
              items={items.filter((d) =>
                detail.kind === "provider-profile"
                  ? d.kind === "service-project" &&
                    d.catalog?.providerKeys.includes(detail.contentKey)
                  : d.kind === "provider-profile" &&
                    detail.catalog?.providerKeys.includes(d.contentKey),
              )}
              locale={locale}
              title={publicText(locale, "Related services and providers")}
            />
            <Related
              items={items.filter(
                (d) => d.kind === "guide" && detail.catalog?.guideKeys.includes(d.contentKey),
              )}
              locale={locale}
              title={publicText(locale, "Preparation guides")}
            />
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{
                __html: JSON.stringify({
                  "@context": "https://schema.org",
                  "@type": kind === "provider-profile" ? "Organization" : "Service",
                  name: detail.title,
                  description: detail.summary,
                  url: catalogPath(detail),
                  areaServed: detail.catalog?.cities.map((c) => cityLabel(c.code, locale)),
                  ...(kind === "service-project"
                    ? { serviceType: detail.catalog?.categories }
                    : {}),
                }).replace(/</g, "\\u003c"),
              }}
            />
          </>
        ) : (
          <>
            <span className="eyebrow">HUA COMPANION</span>
            <h1>{title}</h1>
            <p className="lead">
              {publicText(
                locale,
                "Find a suitable service. Hua coordinates every enquiry and arrangement.",
              )}
            </p>
            <p>
              <Link href={`/${locale}/apply?service=housekeeping`}>
                {homeText(locale, "title")} · {homeText(locale, "join")}
              </Link>
            </p>
            <form action={base} method="get" className="catalog-filters">
              {query.category === "housekeeping" && (
                <>
                  <label>
                    {homeText(locale, "homeService")}
                    <select name="homeService" defaultValue={query.homeService || ""}>
                      <option value="">—</option>
                      {homeServices.map((k) => (
                        <option key={k} value={k}>
                          {homeText(locale, k)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {homeText(locale, "districts")}
                    <input name="district" defaultValue={query.district || ""} />
                  </label>
                  <label>
                    {homeText(locale, "homeEquipment")}
                    <select name="equipment" defaultValue={query.equipment || ""}>
                      <option value="">—</option>
                      {["provider", "customer", "confirm"].map((k) => (
                        <option key={k} value={k}>
                          {homeText(locale, k)}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}

              <label>
                {publicText(locale, "Search")}
                <input
                  name="q"
                  maxLength={200}
                  defaultValue={query.q || ""}
                  placeholder={publicText(locale, "Name or capability")}
                />
              </label>
              <label>
                {publicText(locale, "Category")}
                <select name="category" defaultValue={query.category || ""}>
                  <option value="">{publicText(locale, "All categories")}</option>
                  {services.map((s) => (
                    <option key={s.slug} value={s.slug}>
                      {s.title[locale]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {publicText(locale, "City")}
                <select name="city" defaultValue={query.city || ""}>
                  <option value="">{publicText(locale, "All cities")}</option>
                  {catalogCities.map((city) => (
                    <option key={city.code} value={city.code}>
                      {city[locale]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {publicText(locale, "Language")}
                <select name="language" defaultValue={query.language || ""}>
                  <option value="">{publicText(locale, "All languages")}</option>
                  {catalogLanguages.map((language) => (
                    <option key={language.code} value={language.code}>
                      {language[locale]}
                    </option>
                  ))}
                </select>
              </label>
              <button className="button" type="submit">
                {publicText(locale, "Filter")}
              </button>
              <Link href={base}>{publicText(locale, "Clear filters")}</Link>
            </form>
            <p>{resultText(locale, filtered.length)}</p>
            <div className="guide-grid">
              {filtered.slice((page - 1) * 12, page * 12).map((d) => (
                <Link className="guide-card catalog-card" href={catalogPath(d)} key={d.contentKey}>
                  <span className="eyebrow">
                    {d.catalog?.cities.map((c) => cityLabel(c.code, locale)).join(" · ")}
                  </span>
                  <h2>{d.title}</h2>
                  <p>{d.summary}</p>
                  <p>
                    {(d.catalog?.categories.includes("housekeeping")
                      ? d.catalog.housekeeping?.workerLanguages
                      : d.catalog?.languages
                    )
                      ?.map((l) => languageLabel(l, locale))
                      .join(" / ")}
                  </p>
                  <strong>{priceText(d.catalog!, locale)}</strong>
                  <p>
                    {d.acceptingInquiries
                      ? publicText(locale, "Enquire through Hua →")
                      : publicText(locale, "Enquiries paused")}
                  </p>
                </Link>
              ))}
            </div>
            {!filtered.slice((page - 1) * 12, page * 12).length && (
              <p>
                {publicText(
                  locale,
                  "No published matches. Clear the filters or send Hua your requirements.",
                )}{" "}
                <Link href={`/${locale}/request`}>{publicText(locale, "Send an enquiry")}</Link>
              </p>
            )}
            {count > 1 && (
              <nav
                aria-label={publicText(locale, "Pagination")}
                style={{ display: "flex", gap: 20, marginTop: 30 }}
              >
                {page > 1 && <Link href={href(page - 1)}>{publicText(locale, "Previous")}</Link>}
                <span>
                  {page} / {count}
                </span>
                {page < count && <Link href={href(page + 1)}>{publicText(locale, "Next")}</Link>}
              </nav>
            )}
          </>
        )}
      </main>
      <footer className="footer">
        <Link href="/api/public/catalog/docs">{publicText(locale, "Public data for agents")}</Link>{" "}
        · Hua Companion
      </footer>
    </>
  );
}
export function CatalogDetails({ detail: d, locale }: { detail: ContentBody; locale: Locale }) {
  if (d.locale !== locale) return null;
  const c = d.catalog!;

  const fields: [string, string][] = [
    [publicText(locale, "Cities"), c.cities.map((x) => cityLabel(x.code, locale)).join(" · ")],
    [
      c.categories.includes("housekeeping")
        ? homeText(locale, "workerLanguages")
        : publicText(locale, "Languages"),
      (c.categories.includes("housekeeping") ? c.housekeeping?.workerLanguages || [] : c.languages)
        .map((l) => languageLabel(l, locale))
        .join(" / ") || homeText(locale, "confirm"),
    ],
    [publicText(locale, "Pricing"), priceText(c, locale)],
    [publicText(locale, "Price conditions"), c.price.conditions || ""],
  ];
  if (d.kind === "provider-profile")
    fields.push([publicText(locale, "Capabilities"), c.capabilities]);
  else
    fields.push(
      ...([
        [publicText(locale, "Who it is for"), c.audience],
        [publicText(locale, "Included"), c.includes],
        [publicText(locale, "Excluded"), c.excludes],
        [publicText(locale, "Process"), c.process],
        [publicText(locale, "Deliverables"), c.deliverables],
        [publicText(locale, "Preparation"), c.materials],
        [publicText(locale, "Advance notice"), c.bookingNotice],
        [publicText(locale, "Duration"), c.duration],
        [publicText(locale, "Party size"), c.people],
        [publicText(locale, "Changes and cancellation"), c.changes],
        [
          publicText(locale, "Fulfilment"),
          c.fulfillment === "specified"
            ? publicText(locale, "Specified partners deliver; Hua coordinates")
            : publicText(locale, "Hua arranges providers after confirming requirements"),
        ],
      ] as [string, string][]),
    );
  return (
    <>
      <dl className="catalog-details">
        {fields
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
      {d.kind === "provider-profile" && (
        <section>
          <h2>{publicText(locale, "Verification information")}</h2>
          {c.verification.length ? (
            c.verification.map((v, i) => (
              <p key={i}>
                {v.label} · {v.checkedAt}
              </p>
            ))
          ) : (
            <p>{publicText(locale, "No specific public verification items supplied.")}</p>
          )}
          <p>
            {publicText(
              locale,
              "Verification covers listed items only, and does not guarantee service outcomes.",
            )}
          </p>
        </section>
      )}
    </>
  );
}
function Related({
  items,
  locale,
  title,
}: {
  items: ContentBody[];
  locale: Locale;
  title: string;
}) {
  return items.length ? (
    <section>
      <h2>{title}</h2>
      <ul>
        {items.map((d) => (
          <li key={d.contentKey}>
            <Link href={d.kind === "guide" ? `/${locale}/guides/${d.slug}` : catalogPath(d)}>
              {d.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  ) : null;
}
