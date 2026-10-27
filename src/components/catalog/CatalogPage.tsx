import Link from "next/link";
import { Header } from "../Header";
import { ContentBlocks } from "../content/ContentBlocks";
import type { ContentBody } from "@/lib/content-model";
import { catalogFilter, catalogPath, priceText } from "@/lib/catalog";
import { services } from "@/lib/content";
export type CatalogQuery = {
  category?: string;
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
}: {
  items: ContentBody[];
  locale: "zh" | "en";
  kind: string;
  detail?: ContentBody;
  query?: CatalogQuery;
}) {
  const zh = locale === "zh",
    title =
      kind === "provider-profile"
        ? zh
          ? "服务商"
          : "Service providers"
        : zh
          ? "华伴服务项目"
          : "Hua service projects";
  const base = `/${locale}/${kind === "provider-profile" ? "providers" : "services/projects"}`;
  const candidates = items.filter((d) => d.kind === kind);
  const filtered = catalogFilter(candidates, query);
  const page = Math.max(
    1,
    Number.isSafeInteger(Number(query.page)) ? Number(query.page) : 1,
  );
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
        {zh ? "跳到正文" : "Skip to content"}
      </a>
      <Header locale={locale} />
      <main id="main" className="section">
        <nav
          aria-label={zh ? "服务导航" : "Service navigation"}
          style={{
            display: "flex",
            gap: 20,
            flexWrap: "wrap",
            marginBottom: 30,
          }}
        >
          <Link href={`/${locale}/services`}>
            {zh ? "服务分类" : "Service categories"}
          </Link>
          <Link href={`/${locale}/providers`}>
            {zh ? "服务商" : "Providers"}
          </Link>
          <Link href={`/${locale}/services/projects`}>
            {zh ? "华伴服务项目" : "Hua projects"}
          </Link>
        </nav>
        {detail ? (
          <>
            <Link href={base}>← {title}</Link>
            <h1>{detail.title}</h1>
            <p className="lead">{detail.summary}</p>
            <CatalogDetails detail={detail} locale={locale} />
            <ContentBlocks blocks={detail.blocks} />
            <p>
              {zh ? "更新时间" : "Updated"}: {detail.publishedAt?.slice(0, 10)}
            </p>
            {detail.acceptingInquiries ? (
              <Link
                className="button"
                href={`/${locale}/request?${new URLSearchParams({ [kind === "provider-profile" ? "provider" : "project"]: detail.contentKey, service: detail.catalog!.categories[0] })}`}
              >
                {zh
                  ? kind === "provider-profile"
                    ? "通过华伴咨询"
                    : "咨询此服务"
                  : "Enquire through Hua"}{" "}
                ↗
              </Link>
            ) : (
              <p role="status">
                {zh
                  ? "此方案暂不可咨询，华伴正在确认履约安排。"
                  : "Enquiries for this arrangement are paused while fulfilment is reviewed."}
              </p>
            )}
            <p>
              {zh
                ? "咨询由华伴统一承接。提交需求不代表预约成功；档期和最终报价需另行确认。"
                : "Hua handles all enquiries. Submission does not confirm a booking, availability or final price."}
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
              title={
                zh ? "相关服务与履约机构" : "Related services and providers"
              }
            />
            <Related
              items={items.filter(
                (d) =>
                  d.kind === "guide" &&
                  detail.catalog?.guideKeys.includes(d.contentKey),
              )}
              locale={locale}
              title={zh ? "准备知识" : "Preparation guides"}
            />
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{
                __html: JSON.stringify({
                  "@context": "https://schema.org",
                  "@type":
                    kind === "provider-profile" ? "Organization" : "Service",
                  name: detail.title,
                  description: detail.summary,
                  url: catalogPath(detail),
                  areaServed: detail.catalog?.cities.map((c) => c.name),
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
              {zh
                ? "按需求寻找适合的服务，咨询与安排统一由华伴协调。"
                : "Find a suitable service. Hua coordinates every enquiry and arrangement."}
            </p>
            <form action={base} method="get" className="catalog-filters">
              <label>
                {zh ? "搜索" : "Search"}
                <input
                  name="q"
                  maxLength={200}
                  defaultValue={query.q || ""}
                  placeholder={zh ? "服务名称或能力" : "Name or capability"}
                />
              </label>
              <label>
                {zh ? "类别" : "Category"}
                <select name="category" defaultValue={query.category || ""}>
                  <option value="">{zh ? "全部类别" : "All categories"}</option>
                  {services.map((s) => (
                    <option key={s.slug} value={s.slug}>
                      {s.title[locale]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {zh ? "城市" : "City"}
                <select name="city" defaultValue={query.city || ""}>
                  <option value="">{zh ? "全部城市" : "All cities"}</option>
                  {Array.from(
                    new Map(
                      candidates.flatMap((d) =>
                        d.catalog!.cities.map((c) => [c.code, c.name] as const),
                      ),
                    ),
                  ).map(([code, name]) => (
                    <option key={code} value={code}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {zh ? "语言" : "Language"}
                <select name="language" defaultValue={query.language || ""}>
                  <option value="">{zh ? "全部语言" : "All languages"}</option>
                  {Array.from(
                    new Set(candidates.flatMap((d) => d.catalog!.languages)),
                  ).map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <button className="button" type="submit">
                {zh ? "筛选" : "Filter"}
              </button>
              <Link href={base}>{zh ? "清除筛选" : "Clear filters"}</Link>
            </form>
            <p>
              {zh ? `共 ${filtered.length} 项` : `${filtered.length} results`}
            </p>
            <div className="guide-grid">
              {filtered.slice((page - 1) * 12, page * 12).map((d) => (
                <Link
                  className="guide-card catalog-card"
                  href={catalogPath(d)}
                  key={d.contentKey}
                >
                  <span className="eyebrow">
                    {d.catalog?.cities.map((c) => c.name).join(" · ")}
                  </span>
                  <h2>{d.title}</h2>
                  <p>{d.summary}</p>
                  <p>{d.catalog?.languages.join(" / ")}</p>
                  <strong>{priceText(d.catalog!, locale)}</strong>
                  <p>
                    {d.acceptingInquiries
                      ? zh
                        ? "由华伴承接咨询 →"
                        : "Enquire through Hua →"
                      : zh
                        ? "暂不可咨询"
                        : "Enquiries paused"}
                  </p>
                </Link>
              ))}
            </div>
            {!filtered.slice((page - 1) * 12, page * 12).length && (
              <p>
                {zh
                  ? "暂无符合条件的已发布资料。您可以清除筛选，或向华伴提交需求。"
                  : "No published matches. Clear the filters or send Hua your requirements."}{" "}
                <Link href={`/${locale}/request`}>
                  {zh ? "提交需求" : "Send an enquiry"}
                </Link>
              </p>
            )}
            {count > 1 && (
              <nav
                aria-label={zh ? "分页" : "Pagination"}
                style={{ display: "flex", gap: 20, marginTop: 30 }}
              >
                {page > 1 && (
                  <Link href={href(page - 1)}>
                    {zh ? "上一页" : "Previous"}
                  </Link>
                )}
                <span>
                  {page} / {count}
                </span>
                {page < count && (
                  <Link href={href(page + 1)}>{zh ? "下一页" : "Next"}</Link>
                )}
              </nav>
            )}
          </>
        )}
      </main>
      <footer className="footer">
        <Link href="/api/public/catalog/docs">
          {zh ? "Agent 公开读取说明" : "Public data for agents"}
        </Link>{" "}
        · Hua Companion
      </footer>
    </>
  );
}
export function CatalogDetails({
  detail: d,
  locale,
}: {
  detail: ContentBody;
  locale: "zh" | "en";
}) {
  const c = d.catalog!;
  const zh = locale === "zh";
  const fields: [string, string][] = [
    [zh ? "服务城市" : "Cities", c.cities.map((x) => x.name).join(" · ")],
    [zh ? "支持语言" : "Languages", c.languages.join(" / ")],
    [zh ? "计价方式" : "Pricing", priceText(c, locale)],
    [zh ? "价格适用条件" : "Price conditions", c.price.conditions || ""],
  ];
  if (d.kind === "provider-profile")
    fields.push([zh ? "服务能力" : "Capabilities", c.capabilities]);
  else
    fields.push(
      ...([
        [zh ? "适用对象" : "Who it is for", c.audience],
        [zh ? "包含项目" : "Included", c.includes],
        [zh ? "不包含项目" : "Excluded", c.excludes],
        [zh ? "服务流程" : "Process", c.process],
        [zh ? "交付内容" : "Deliverables", c.deliverables],
        [zh ? "准备材料" : "Preparation", c.materials],
        [zh ? "提前预约" : "Advance notice", c.bookingNotice],
        [zh ? "时长" : "Duration", c.duration],
        [zh ? "人数" : "Party size", c.people],
        [zh ? "变更与取消" : "Changes and cancellation", c.changes],
        [
          zh ? "履约方式" : "Fulfilment",
          c.fulfillment === "specified"
            ? zh
              ? "指定合作服务商履约，华伴协调"
              : "Specified partners deliver; Hua coordinates"
            : zh
              ? "华伴按需求安排，服务商待确认"
              : "Hua arranges providers after confirming requirements",
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
          <h2>{zh ? "公开核验信息" : "Verification information"}</h2>
          {c.verification.length ? (
            c.verification.map((v, i) => (
              <p key={i}>
                {v.label} · {v.checkedAt}
              </p>
            ))
          ) : (
            <p>
              {zh
                ? "未提供具体公开核验事项。"
                : "No specific public verification items supplied."}
            </p>
          )}
          <p>
            {zh
              ? "核验仅针对列明事项，不代表服务结果保证。"
              : "Verification covers listed items only, and does not guarantee service outcomes."}
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
  locale: "zh" | "en";
  title: string;
}) {
  return items.length ? (
    <section>
      <h2>{title}</h2>
      <ul>
        {items.map((d) => (
          <li key={d.contentKey}>
            <Link
              href={
                d.kind === "guide"
                  ? `/${locale}/guides/${d.slug}`
                  : catalogPath(d)
              }
            >
              {d.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  ) : null;
}
