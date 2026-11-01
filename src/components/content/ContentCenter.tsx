"use client";
import "./content-center.css";
import type { ContentMedia } from "../../../payload-types";
import { catalogLanguages } from "@/lib/catalog-options";
import { contentSections, sectionFor, filterContent } from "@/lib/content-sections";
import { catalogCities } from "@/lib/catalog-options";
import { HousekeepingFields } from "./HousekeepingFields";
import { emptyHousekeeping } from "@/lib/housekeeping";
import { CatalogFields } from "./CatalogFields";
import {
  ExhibitionFields,
  exhibitionIndustryLabels,
  exhibitionStatusLabels,
} from "./ExhibitionFields";
import {
  InstitutionFields,
  institutionTypeLabels,
  institutionAcceptanceLabels,
} from "./InstitutionFields";
import { LifestyleFields } from "./LifestyleFields";
import { emptyLifestyle, isLife, lifeCategories, effectiveLifeStatus } from "@/lib/lifestyle";
import { lifeText } from "@/lib/lifestyle-copy";
import { emptyInstitution } from "@/lib/institutions";
import { emptyExhibition, effectiveExhibitionStatus } from "@/lib/exhibitions";
import { isCatalog, emptyCatalog } from "@/lib/catalog";
import { useEffect, useState } from "react";
import type { ContentBody, Block } from "@/lib/content-model";
const empty = (): ContentBody => ({
  kind: "guide",
  locale: "zh",
  contentKey: "",
  slug: "",
  title: "",
  summary: "",
  blocks: [],
  sources: [],
  category: 1,
});
const kinds = {
  venue: "体验场所与餐馆",
  activity: "体验活动",
  institution: "医疗与康养机构",
  exhibition: "展会信息",
  guide: "来华指南",
  service: "服务介绍",
  faq: "常见问题",
  page: "网站页面",
  partner: "公开伙伴",
  "provider-profile": "服务商展示",
  "service-project": "华伴服务项目",
};
const states: Record<string, string> = {
  draft: "草稿",
  review: "待审核",
  returned: "已退回",
  approved: "已审核",
  unconfigured: "模型未配置",
  queued: "待运行",
  running: "运行中",
  succeeded: "成功",
  failed: "失败",
  cancelled: "已取消",
};
export function ContentCenter({ initialKind = "" }: { initialKind?: string }) {
  const [data, setData] = useState<any>({
    drafts: [],
    published: [],
    media: [],
    tasks: [],
  });
  const [selected, setSelected] = useState<any>(null);
  const [body, setBody] = useState<ContentBody>(() => ({
    ...empty(),
    ...(isLife(initialKind) ? { kind: initialKind, lifestyle: emptyLifestyle(initialKind) } : {}),
    ...(initialKind === "institution"
      ? { kind: "institution" as const, institution: emptyInstitution() }
      : {}),
    ...(initialKind === "exhibition"
      ? { kind: "exhibition" as const, exhibition: emptyExhibition() }
      : {}),
    ...(isCatalog(initialKind)
      ? { kind: initialKind as ContentBody["kind"], catalog: emptyCatalog() }
      : {}),
  }));
  const [kindFilter, setKindFilter] = useState(initialKind);
  const [cityFilter, setCityFilter] = useState("");
  const [industryFilter, setIndustryFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [institutionTypeFilter, setInstitutionTypeFilter] = useState("");
  const [acceptanceFilter, setAcceptanceFilter] = useState("");
  const [serviceLanguageFilter, setServiceLanguageFilter] = useState("");
  const [lifeReviewed, setLifeReviewed] = useState(false);
  const [lifeCategory, setLifeCategory] = useState("");
  const [lifeStatus, setLifeStatus] = useState("");
  const [reviewBefore, setReviewBefore] = useState("");
  const [institutionReviewed, setInstitutionReviewed] = useState(false);
  const [exhibitionReviewed, setExhibitionReviewed] = useState(false);
  const [publicationFilter, setPublicationFilter] = useState("");
  const [providerRef, setProviderRef] = useState("");
  const [catalogReviewed, setCatalogReviewed] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const permissions = data.permissions || {};
  const canEdit = !!permissions.canEdit;
  const canReview = !!permissions.canReview;
  const isAdmin = !!permissions.isAdmin;
  const allowedKinds: string[] = permissions.contentKinds || [];
  const editable = canEdit && selected?.reviewState !== "review";
  const selfReview =
    !!selected &&
    [
      ...(Array.isArray(selected.contributors) ? selected.contributors : []),
      selected.lastEditedBy,
      selected.submittedBy,
    ].some((id) => id != null && String(id) === String(permissions.userId));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("content");
  const [section, setSection] = useState(0);
  const [language, setLanguage] = useState("");
  const [state, setState] = useState("");
  const [search, setSearch] = useState("");
  const [versions, setVersions] = useState<any[]>([]);
  const [taskText, setTaskText] = useState("");
  const [material, setMaterial] = useState("");
  const [targetLocale, setTargetLocale] = useState("en");
  const [taskKind, setTaskKind] = useState("draft");
  async function load() {
    const r = await fetch("/api/content-center", { cache: "no-store" });
    const d = await r.json();
    if (!r.ok) {
      if ([401, 403].includes(r.status)) {
        setData({ drafts: [], published: [], media: [], tasks: [] });
        setSelected(null);
        setBody(empty());
        window.location.assign("/admin/login");
      }
      throw Error(d.error);
    }
    setData(d);
    setSelected((previous: any) => {
      if (previous && !d.drafts.some((draft: any) => draft.id === previous.id)) {
        setBody(empty());
        return null;
      }
      return previous;
    });
    return d;
  }
  useEffect(() => {
    load()
      .then((d) => {
        const permitted = d.permissions?.contentKinds || [];
        const kind = permitted.includes(initialKind) ? initialKind : permitted[0];
        if (kind) {
          setBody({
            ...empty(),
            kind,
            ...(isLife(kind) ? { lifestyle: emptyLifestyle(kind) } : {}),
            ...(kind === "institution" ? { institution: emptyInstitution() } : {}),
            ...(kind === "exhibition" ? { exhibition: emptyExhibition() } : {}),
            ...(isCatalog(kind) ? { catalog: emptyCatalog() } : {}),
          });
          if (initialKind && !permitted.includes(initialKind)) setKindFilter("");
        }
      })
      .catch((e) => setMessage(e.message));
    const refresh = () => {
      load().catch((e) => setMessage(e.message));
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  function select(d: any) {
    setSelected(d);
    setOverrideReason("");
    setProviderRef(d.providerRef ? String(d.providerRef) : "");
    setCatalogReviewed(false);
    setExhibitionReviewed(false);
    setInstitutionReviewed(false);
    setLifeReviewed(false);
    setBody({ ...d.body, category: sectionFor(d.body) });
    setVersions([]);
    setMessage("");
  }
  async function action(action: string, extra: any = {}) {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/content-center", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          id: selected?.id,
          revision: selected?.revision,
          ...(action === "save"
            ? {
                body,
                ...(["provider-profile", "institution", "venue", "activity"].includes(body.kind) &&
                isAdmin
                  ? { providerRef: providerRef ? Number(providerRef) : null }
                  : {}),
              }
            : {}),
          ...(["publish", "return", "unpublish"].includes(action)
            ? {
                catalogReviewed,
                exhibitionReviewed,
                institutionReviewed,
                lifeReviewed,
                overrideReason,
              }
            : {}),
          ...extra,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        if ([401, 403].includes(r.status)) await load();
        throw Error(d.error);
      }
      await load();
      select(d);
      setMessage(
        action === "publish"
          ? "已发布到本地网站"
          : action === "unpublish"
            ? "已下架"
            : "已保存；修改不会改变当前正式版",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function field(key: keyof ContentBody, value: any) {
    setBody({
      ...body,
      [key]:
        key === "catalog" && value?.categories?.includes("housekeeping")
          ? { ...value, housekeeping: value.housekeeping || emptyHousekeeping() }
          : value,
      ...(key === "kind" && isLife(value) ? { lifestyle: emptyLifestyle(value) } : {}),
      ...(key === "kind" && value === "institution" && !body.institution
        ? { institution: emptyInstitution() }
        : {}),
      ...(key === "kind" && value === "exhibition" && !body.exhibition
        ? { exhibition: emptyExhibition() }
        : {}),
      ...(key === "kind" && isCatalog(value) && !body.catalog ? { catalog: emptyCatalog() } : {}),
    });
    setCatalogReviewed(false);
    setExhibitionReviewed(false);
    setInstitutionReviewed(false);
    setLifeReviewed(false);
  }
  function block(index: number, value: Partial<Block>) {
    field(
      "blocks",
      body.blocks.map((b, i) => (i === index ? { ...b, ...value } : b)),
    );
  }
  async function task(action: string, id?: number) {
    setBusy(true);
    try {
      const r = await fetch("/api/content-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          id,
          kind: taskKind,
          title: taskText,
          material,
          draftId: selected?.id,
          revision: selected?.revision,
          sources: body.sources,
          locale: body.locale,
          targetLocale,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        if ([401, 403].includes(r.status)) await load();
        throw Error(d.error);
      }
      await load();
      setMessage(d.message || "AI任务已更新");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="content-center">
      <a href="/admin">← 中文管理后台</a>
      <h1>
        {isLife(initialKind)
          ? initialKind === "venue"
            ? "体验场所与餐馆管理"
            : "体验活动管理"
          : initialKind === "institution"
            ? "医疗与康养机构管理"
            : initialKind === "exhibition"
              ? "展会信息管理"
              : initialKind === "provider-profile"
                ? "服务商展示内容管理"
                : initialKind === "service-project"
                  ? "华伴服务项目管理"
                  : "知识与网站内容管理"}
      </h1>
      <nav
        aria-label="内容管理栏目"
        style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "20px 0" }}
      >
        <a href="/content-center">知识与网站内容</a>
        {Object.entries(kinds)
          .filter(([kind]) => allowedKinds.includes(kind))
          .map(([kind, label]) => (
            <a key={kind} href={`/content-center?kind=${kind}`}>
              {label}
            </a>
          ))}
      </nav>
      {isCatalog(initialKind) && (
        <p>
          在此新建、编辑、预览和审核发布展示内容。服务商入驻申请与合作许可仍在业务后台单独管理。
        </p>
      )}
      <p>
        编辑与 AI 生成的内容先进入草稿，只有授权审核员核验后才能发布。网站与未来 App 共用正式内容。
      </p>
      <nav>
        {[
          ["content", "编辑与发布"],
          ["media", "图片素材"],
          ["agent", "AI 内容任务"],
        ].map(([id, label]) => (
          <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {tab === "content" && (
        <div className="workspace">
          <aside className="panel">
            <button
              disabled={!canEdit || busy}
              onClick={() => {
                setSelected(null);
                setBody({
                  ...empty(),
                  kind: (kindFilter || allowedKinds[0] || "guide") as ContentBody["kind"],
                  ...(isLife(kindFilter) ? { lifestyle: emptyLifestyle(kindFilter) } : {}),
                  ...(kindFilter === "institution"
                    ? {
                        kind: "institution" as const,
                        institution: emptyInstitution(),
                      }
                    : {}),
                  ...(kindFilter === "exhibition"
                    ? {
                        kind: "exhibition" as const,
                        exhibition: emptyExhibition(),
                      }
                    : {}),
                  ...(isCatalog(kindFilter)
                    ? {
                        kind: kindFilter as ContentBody["kind"],
                        catalog: emptyCatalog(),
                      }
                    : {}),
                });
                setProviderRef("");
                setCatalogReviewed(false);
                setExhibitionReviewed(false);
                setInstitutionReviewed(false);
                setLifeReviewed(false);
                setVersions([]);
              }}
            >
              {kindFilter === "institution"
                ? "＋ 新建机构"
                : kindFilter === "exhibition"
                  ? "＋ 新建展会"
                  : kindFilter === "provider-profile"
                    ? "＋ 新建服务商展示"
                    : kindFilter === "service-project"
                      ? "＋ 新建服务项目"
                      : "＋ 新建内容"}
            </button>
            <label>
              内容库
              <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
                <option value="">全部类型</option>
                {Object.entries(kinds)
                  .filter(([v]) => allowedKinds.includes(v))
                  .map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              发布状态
              <select
                value={publicationFilter}
                onChange={(e) => setPublicationFilter(e.target.value)}
              >
                <option value="">全部</option>
                <option value="live">
                  {kindFilter === "exhibition" ? "网站已发布" : "公开可咨询"}
                </option>
                <option value="paused">暂停／受限制</option>
                <option value="offline">未发布／已下架</option>
              </select>
            </label>
            <label>
              {kindFilter === "institution"
                ? "机构城市"
                : kindFilter === "exhibition"
                  ? "展会城市"
                  : "服务城市"}
              <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)}>
                <option value="">全部城市</option>
                {catalogCities.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.zh}
                  </option>
                ))}
              </select>
            </label>
            {isLife(kindFilter) && (
              <div className="form-grid">
                <label>
                  体验分类
                  <select value={lifeCategory} onChange={(e) => setLifeCategory(e.target.value)}>
                    <option value="">全部</option>
                    {lifeCategories.map((k) => (
                      <option key={k} value={k}>
                        {lifeText("zh", k)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  营业／活动状态
                  <select value={lifeStatus} onChange={(e) => setLifeStatus(e.target.value)}>
                    <option value="">全部</option>
                    {[
                      "open",
                      "paused",
                      "closed",
                      "scheduled",
                      "full",
                      "cancelled",
                      "postponed",
                      "ended",
                      "registrationClosed",
                    ].map((k) => (
                      <option key={k} value={k}>
                        {lifeText("zh", k)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  复核到期不晚于
                  <input
                    type="date"
                    value={reviewBefore}
                    onChange={(e) => setReviewBefore(e.target.value)}
                  />
                </label>
              </div>
            )}
            {kindFilter === "institution" && (
              <>
                <label>
                  机构类型
                  <select
                    value={institutionTypeFilter}
                    onChange={(e) => setInstitutionTypeFilter(e.target.value)}
                  >
                    <option value="">全部类型</option>
                    {Object.entries(institutionTypeLabels).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  接待状态
                  <select
                    value={acceptanceFilter}
                    onChange={(e) => setAcceptanceFilter(e.target.value)}
                  >
                    <option value="">全部接待状态</option>
                    {Object.entries(institutionAcceptanceLabels).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  机构服务语言
                  <select
                    value={serviceLanguageFilter}
                    onChange={(e) => setServiceLanguageFilter(e.target.value)}
                  >
                    <option value="">全部服务语言</option>
                    {catalogLanguages.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.zh}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {kindFilter === "exhibition" && (
              <>
                <label>
                  展会行业
                  <select
                    value={industryFilter}
                    onChange={(e) => setIndustryFilter(e.target.value)}
                  >
                    <option value="">全部行业</option>
                    {Object.entries(exhibitionIndustryLabels).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  举办月份
                  <input
                    type="month"
                    value={monthFilter}
                    onChange={(e) => setMonthFilter(e.target.value)}
                  />
                </label>
                <label>
                  展会状态
                  <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)}>
                    <option value="">全部状态</option>
                    {Object.entries(exhibitionStatusLabels).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <small>展会状态与发布、审核状态分别管理；已结束展会可以保留公开归档。</small>
              </>
            )}
            <label>
              查找内容
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="标题、语言或网址"
              />
            </label>
            <label>
              板块
              <select value={section} onChange={(e) => setSection(Number(e.target.value))}>
                <option value={0}>全部板块</option>
                {contentSections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.zh}（{data.drafts.filter((d: any) => sectionFor(d.body) === s.id).length}）
                  </option>
                ))}
              </select>
            </label>
            <div className="row">
              <label>
                语言
                <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                  <option value="">全部</option>
                  {catalogLanguages.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.zh}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                审核状态
                <select value={state} onChange={(e) => setState(e.target.value)}>
                  <option value="">全部</option>
                  {["draft", "review", "returned", "approved"].map((s) => (
                    <option key={s} value={s}>
                      {states[s]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {filterContent(
              data.drafts.filter(
                (d: any) =>
                  (!publicationFilter ||
                    (() => {
                      const pub = data.published.find((p: any) => p.draftId === d.id);
                      if (d.kind === "exhibition")
                        return publicationFilter === "live"
                          ? !!pub?.visible
                          : publicationFilter === "paused"
                            ? !!pub?.active && !pub?.visible
                            : !pub?.active;
                      return publicationFilter === "live"
                        ? pub?.visible && pub?.acceptingInquiries !== false
                        : publicationFilter === "paused"
                          ? pub?.active && (!pub?.visible || pub?.acceptingInquiries === false)
                          : !pub?.active;
                    })()) &&
                  (!kindFilter || d.kind === kindFilter) &&
                  (!isLife(kindFilter) ||
                    ((!lifeCategory || d.body.lifestyle?.category === lifeCategory) &&
                      (!lifeStatus ||
                        effectiveLifeStatus(d.body.lifestyle, d.kind) === lifeStatus) &&
                      (!reviewBefore ||
                        (d.body.lifestyle?.reviewDue &&
                          d.body.lifestyle.reviewDue <= reviewBefore)))) &&
                  (!cityFilter ||
                    (isLife(d.kind)
                      ? d.body.lifestyle?.city === cityFilter
                      : d.kind === "institution"
                        ? d.body.institution?.city === cityFilter
                        : d.kind === "exhibition"
                          ? d.body.exhibition?.city === cityFilter
                          : d.body.catalog?.cities.some((c: any) => c.code === cityFilter))) &&
                  (kindFilter !== "institution" ||
                    ((!institutionTypeFilter ||
                      d.body.institution?.type === institutionTypeFilter) &&
                      (!acceptanceFilter ||
                        d.body.institution?.foreignAcceptance === acceptanceFilter) &&
                      (!serviceLanguageFilter ||
                        d.body.institution?.languages.includes(serviceLanguageFilter)))) &&
                  (kindFilter !== "exhibition" ||
                    ((!industryFilter || d.body.exhibition?.industries.includes(industryFilter)) &&
                      (!monthFilter ||
                        (d.body.exhibition?.startDate?.slice(0, 7) <= monthFilter &&
                          d.body.exhibition?.endDate?.slice(0, 7) >= monthFilter)) &&
                      (!eventFilter ||
                        (d.body.exhibition &&
                          effectiveExhibitionStatus(d.body.exhibition) === eventFilter)))),
              ),
              {
                section,
                locale: language,
                state,
                query: search,
              },
            ).map((d: any) => (
              <button className="item" key={d.id} onClick={() => select(d)}>
                {d.title}
                <small>
                  {contentSections.find((s) => s.id === sectionFor(d.body))?.zh} · {d.locale} ·{" "}
                  {kinds[d.kind as keyof typeof kinds]} · {states[d.reviewState]}
                  {d.kind === "exhibition" && d.body.exhibition
                    ? ` · ${exhibitionStatusLabels[effectiveExhibitionStatus(d.body.exhibition)]}`
                    : ""}
                  {data.published.some((p: any) => p.draftId === d.id && p.visible)
                    ? data.published.find((p: any) => p.draftId === d.id)?.acceptingInquiries ===
                        false && d.kind !== "exhibition"
                      ? " · 已展示，暂停咨询"
                      : " · 网站已发布"
                    : ""}
                </small>
              </button>
            ))}
          </aside>
          <section className="panel">
            <h2>{selected ? "编辑工作稿" : "新建工作稿"}</h2>
            {selected &&
              isCatalog(body.kind) &&
              data.published.some(
                (p: any) =>
                  p.draftId === selected.id &&
                  p.active &&
                  (!p.visible || p.acceptingInquiries === false),
              ) && (
                <p role="status" className="notice">
                  当前公开展示或咨询受限：请检查服务商许可与履约关联。项目恢复需重新提交审核并发布。
                </p>
              )}
            <fieldset disabled={busy || !editable} style={{ border: 0, padding: 0 }}>
              <div className="row">
                <label>
                  内容类型
                  <select
                    value={body.kind}
                    disabled={!!selected}
                    onChange={(e) => field("kind", e.target.value)}
                  >
                    {Object.entries(kinds)
                      .filter(([v]) => allowedKinds.includes(v))
                      .map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  语言
                  <select
                    value={body.locale}
                    disabled={!!selected}
                    onChange={(e) => field("locale", e.target.value)}
                  >
                    {catalogLanguages.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.zh}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                内容标识（各语言共用，例如 arrival-guide）
                <input
                  value={body.contentKey}
                  disabled={!!selected}
                  onChange={(e) => field("contentKey", e.target.value)}
                />
              </label>
              {isLife(body.kind) && (
                <>
                  <LifestyleFields
                    kind={body.kind}
                    value={body.lifestyle || emptyLifestyle(body.kind)}
                    onChange={(v) => field("lifestyle", v)}
                  />
                  {isAdmin && (
                    <label>
                      内部服务商编号（仅管理员可见）
                      <input
                        type="number"
                        value={providerRef}
                        onChange={(e) => setProviderRef(e.target.value)}
                      />
                    </label>
                  )}
                </>
              )}
              {isCatalog(body.kind) && body.catalog?.categories.includes("housekeeping") && (
                <HousekeepingFields
                  value={body.catalog.housekeeping || emptyHousekeeping()}
                  onChange={(v) => field("catalog", { ...body.catalog, housekeeping: v })}
                />
              )}
              {body.kind === "institution" && (
                <>
                  <InstitutionFields
                    value={body.institution || emptyInstitution()}
                    onChange={(v) => field("institution", v)}
                    choices={data.drafts.filter(
                      (d: any) => d.locale === body.locale && d.kind === "service-project",
                    )}
                  />
                  {isAdmin ? (
                    <>
                      <label>
                        关联内部合作档案（可选，仅后台可见）
                        <select
                          value={providerRef}
                          onChange={(e) => {
                            setProviderRef(e.target.value);
                            setInstitutionReviewed(false);
                            setLifeReviewed(false);
                          }}
                        >
                          <option value="">不关联内部档案</option>
                          {(data.providers || []).map((p: any) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                          {providerRef &&
                            !(data.providers || []).some(
                              (p: any) => String(p.id) === providerRef,
                            ) && <option value={providerRef}>现有关联档案：{providerRef}</option>}
                        </select>
                      </label>
                      <small>
                        公开目录不要求机构已签约。关联档案及其中联系人、合同和私有资质材料不会出现在公开机构资料中。
                      </small>
                      <span>发布核验请使用下方审核区。</span>
                    </>
                  ) : (
                    <p>内部档案关联和发布核验由管理员维护。</p>
                  )}
                  <p>
                    先保存修改，再进行人工发布核验。修改后需重新勾选；AI
                    不会自动确认接待能力或发布。
                  </p>
                </>
              )}
              {body.kind === "exhibition" && (
                <p>
                  每届展会使用独立内容标识（例如
                  industry-show-2027）；同一届的各语言版本共用标识。下一届请新建，保留往届归档。
                </p>
              )}
              <label>
                网址标识（小写英文与连字符）
                <input
                  value={body.slug}
                  disabled={selected?.everPublished}
                  onChange={(e) => field("slug", e.target.value)}
                />
              </label>
              <label>
                标题
                <input value={body.title} onChange={(e) => field("title", e.target.value)} />
              </label>
              <label>
                摘要
                <textarea
                  value={body.summary || ""}
                  onChange={(e) => field("summary", e.target.value)}
                />
              </label>
              <div className="row">
                <label>
                  作者／编写团队
                  <input
                    value={body.author || ""}
                    onChange={(e) => field("author", e.target.value)}
                  />
                </label>
                <label>
                  显示顺序
                  <input
                    type="number"
                    value={body.order || 0}
                    onChange={(e) => field("order", Number(e.target.value))}
                  />
                </label>
                <label>
                  主板块
                  <select
                    value={isLife(body.kind) ? 6 : body.category || 1}
                    disabled={isLife(body.kind)}
                    onChange={(e) => field("category", Number(e.target.value))}
                  >
                    {contentSections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.zh}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <details>
                <summary>搜索展示与适用日期</summary>
                <label>
                  搜索标题（可选）
                  <input
                    value={body.seoTitle || ""}
                    maxLength={200}
                    onChange={(e) => field("seoTitle", e.target.value)}
                  />
                </label>
                <label>
                  搜索摘要（可选）
                  <textarea
                    value={body.seoDescription || ""}
                    maxLength={500}
                    onChange={(e) => field("seoDescription", e.target.value)}
                  />
                </label>
                <label>
                  分享图片（可选，保存草稿后仍须审核发布）
                  <select
                    value={body.seoImage || ""}
                    onChange={(event) =>
                      field("seoImage", event.target.value ? Number(event.target.value) : undefined)
                    }
                  >
                    <option value="">不指定分享图</option>
                    {data.media.map((media: ContentMedia) => (
                      <option key={media.id} value={media.id}>
                        {media.alt || media.filename}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  信息适用截止日（可选，不会自动下架）
                  <input
                    type="date"
                    value={body.expiresAt || ""}
                    onChange={(e) => field("expiresAt", e.target.value)}
                  />
                </label>
              </details>
              {isCatalog(body.kind) && (
                <>
                  <CatalogFields
                    kind={body.kind}
                    value={body.catalog || emptyCatalog()}
                    onChange={(v) => field("catalog", v)}
                    choices={data.drafts.filter((d: any) => d.locale === body.locale)}
                  />
                  {body.kind === "provider-profile" &&
                    (isAdmin ? (
                      <label>
                        关联内部服务商
                        <select
                          value={providerRef}
                          onChange={(e) => {
                            setProviderRef(e.target.value);
                            setCatalogReviewed(false);
                            setExhibitionReviewed(false);
                            setInstitutionReviewed(false);
                            setLifeReviewed(false);
                          }}
                        >
                          <option value="">请选择已入驻的服务商</option>
                          {(data.providers || []).map((p: any) => (
                            <option value={p.id} key={p.id}>
                              {p.name} ·{" "}
                              {p.publicApproved && ["verified", "contracted"].includes(p.status)
                                ? "已获准展示"
                                : "尚未获准展示"}
                            </option>
                          ))}
                        </select>
                        <small>
                          需在业务后台完成核实／签约并取得公开展示许可；未获许可可以保存草稿，但不能发布。
                        </small>
                      </label>
                    ) : (
                      <p>内部服务商关联由管理员维护。</p>
                    ))}
                  <span>发布核验请使用下方审核区。</span>
                  <p>先保存修改，再提交审核。管理员发布时需勾选以上检查。</p>
                </>
              )}
              {body.kind === "exhibition" && (
                <>
                  <ExhibitionFields
                    value={body.exhibition || emptyExhibition()}
                    onChange={(v) => field("exhibition", v)}
                    choices={data.drafts.filter(
                      (d: any) => d.locale === body.locale && d.kind === "service-project",
                    )}
                  />
                  {isAdmin && <span>发布核验请使用下方审核区。</span>}
                  <p>
                    先保存再审核。核实日期必须来自实际人工核查；AI
                    不会自动确认或发布。图片沿用下方素材与正文，图片署名请填写在正文说明或来源中。
                  </p>
                </>
              )}
              <h2>正文</h2>
              {body.blocks.map((b, i) => (
                <div className="block" key={i}>
                  <select
                    aria-label={`段落${i + 1}类型`}
                    value={b.type}
                    onChange={(e) => block(i, { type: e.target.value as Block["type"] })}
                  >
                    {[
                      ["paragraph", "段落"],
                      ["heading", "小标题"],
                      ["list", "列表（每行一项）"],
                      ["link", "链接"],
                      ["image", "图片"],
                    ].map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                  {b.type === "image" && (
                    <select
                      aria-label="选择图片"
                      value={b.mediaId || ""}
                      onChange={(e) => block(i, { mediaId: Number(e.target.value) })}
                    >
                      <option value="">请选择已上传图片</option>
                      {data.media.map((m: any) => (
                        <option key={m.id} value={m.id}>
                          {m.alt}
                        </option>
                      ))}
                    </select>
                  )}
                  <textarea
                    aria-label={`段落${i + 1}内容`}
                    value={b.text || ""}
                    onChange={(e) => block(i, { text: e.target.value })}
                  />
                  {b.type === "link" && (
                    <input
                      aria-label="链接网址"
                      value={b.url || ""}
                      onChange={(e) => block(i, { url: e.target.value })}
                    />
                  )}
                  <button
                    onClick={() =>
                      field(
                        "blocks",
                        body.blocks.filter((_, j) => j !== i),
                      )
                    }
                  >
                    移除此段
                  </button>
                </div>
              ))}
              <button
                onClick={() => field("blocks", [...body.blocks, { type: "paragraph", text: "" }])}
              >
                ＋ 添加正文段落
              </button>
              <h2>资料来源</h2>
              <p>请人工核实，提供网址不代表系统已经读取或核实该来源。</p>
              {body.sources.map((s, i) => (
                <div className="block" key={i}>
                  <input
                    aria-label="来源标题"
                    placeholder="来源标题"
                    value={s.title}
                    onChange={(e) =>
                      field(
                        "sources",
                        body.sources.map((x, j) => (i === j ? { ...x, title: e.target.value } : x)),
                      )
                    }
                  />
                  <input
                    aria-label="来源网址"
                    placeholder="https://…"
                    value={s.url}
                    onChange={(e) =>
                      field(
                        "sources",
                        body.sources.map((x, j) => (i === j ? { ...x, url: e.target.value } : x)),
                      )
                    }
                  />
                  <label>
                    人工核实日期（可选）
                    <input
                      type="date"
                      value={s.checkedAt || ""}
                      onChange={(e) =>
                        field(
                          "sources",
                          body.sources.map((x, j) =>
                            i === j ? { ...x, checkedAt: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    onClick={() =>
                      field(
                        "sources",
                        body.sources.filter((_, j) => i !== j),
                      )
                    }
                  >
                    移除此来源
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  field("sources", [
                    ...body.sources,
                    { id: crypto.randomUUID(), title: "", url: "" },
                  ])
                }
              >
                ＋ 添加来源
              </button>
              <p>{selected?.reviewNote}</p>
            </fieldset>
            {selected?.reviewState === "review" && (
              <p>待审核内容已锁定编辑，请先由审核员退回再修改。</p>
            )}
            <button
              disabled={busy || !editable || !allowedKinds.includes(body.kind)}
              onClick={() => action("save")}
            >
              保存草稿
            </button>
            {selected && (
              <>
                <a href={`/content-preview/${selected.id}`} target="_blank" rel="noreferrer">
                  预览已保存工作稿 ↗
                </a>
                <button disabled={busy || !editable} onClick={() => action("submit")}>
                  提交已保存稿审核
                </button>
                {canReview && (
                  <>
                    <h3>审核与发布</h3>
                    {isCatalog(body.kind) && (
                      <label>
                        <input
                          type="checkbox"
                          style={{ width: "auto" }}
                          checked={catalogReviewed}
                          onChange={(e) => setCatalogReviewed(e.target.checked)}
                        />{" "}
                        已核验公开资料、图片权利及服务范围，不含内部联系方式。
                      </label>
                    )}
                    {body.kind === "exhibition" && (
                      <label>
                        <input
                          type="checkbox"
                          style={{ width: "auto" }}
                          checked={exhibitionReviewed}
                          onChange={(e) => setExhibitionReviewed(e.target.checked)}
                        />{" "}
                        已核验官方来源、展期、地址和报名条件。
                      </label>
                    )}
                    {isLife(body.kind) && (
                      <label>
                        <input
                          type="checkbox"
                          style={{ width: "auto" }}
                          checked={lifeReviewed}
                          onChange={(e) => setLifeReviewed(e.target.checked)}
                        />{" "}
                        已人工核实来源、营业或活动时间、收费、语言和参加要求。
                      </label>
                    )}
                    {body.kind === "institution" && (
                      <label>
                        <input
                          type="checkbox"
                          style={{ width: "auto" }}
                          checked={institutionReviewed}
                          onChange={(e) => setInstitutionReviewed(e.target.checked)}
                        />{" "}
                        已核验官方来源、资质说明、接待条件及服务语言。
                      </label>
                    )}
                    {selfReview &&
                      (isAdmin ? (
                        <label>
                          管理员代审原因（必填）
                          <textarea
                            value={overrideReason}
                            onChange={(e) => setOverrideReason(e.target.value)}
                          />
                        </label>
                      ) : (
                        <p>本人编辑或提交的内容，请交由另一位审核员审核。</p>
                      ))}
                    <button
                      disabled={
                        busy ||
                        selected.reviewState !== "review" ||
                        (selfReview && (!isAdmin || !overrideReason.trim())) ||
                        (isCatalog(body.kind) && !catalogReviewed) ||
                        (body.kind === "exhibition" && !exhibitionReviewed) ||
                        (isLife(body.kind) && !lifeReviewed) ||
                        (body.kind === "institution" && !institutionReviewed)
                      }
                      onClick={() => action("publish")}
                    >
                      审核并发布已保存稿
                    </button>
                    <button
                      disabled={busy || selected.reviewState !== "review"}
                      onClick={() =>
                        action("return", {
                          note: prompt("退回修改意见") || "请修改后重新提交",
                        })
                      }
                    >
                      退回修改
                    </button>
                    <button disabled={busy} onClick={() => action("unpublish")}>
                      下架
                    </button>
                  </>
                )}
                <button
                  onClick={async () => {
                    const r = await fetch(`/api/content-center?versions=${selected.id}`);
                    const d = await r.json();
                    if (r.ok) setVersions(d.versions);
                    else setMessage(d.error);
                  }}
                >
                  历史版本
                </button>
                <p>发布及预览只使用已保存版本；请先保存正在编辑的内容。</p>
                {data.drafts
                  .filter((d: any) => d.contentKey === body.contentKey && d.locale !== body.locale)
                  .map((d: any) => (
                    <p key={d.id}>
                      <button onClick={() => select(d)}>打开 {d.locale} 对应内容</button>
                      {d.sourceRevision && d.sourceRevision !== selected.revision
                        ? "原文已变化，译文需复核"
                        : ""}
                    </p>
                  ))}
              </>
            )}
            {versions.map((v) => (
              <p key={v.id}>
                修订 {v.revision} · {v.updatedAt}
                <button
                  disabled={busy || !editable}
                  onClick={() => action("restore", { versionId: v.id })}
                >
                  恢复为新草稿
                </button>
              </p>
            ))}
          </section>
        </div>
      )}
      {tab === "media" && (
        <section className="panel">
          <h2>图片素材</h2>
          <p>仅接受 JPEG、PNG、WebP，最大10MB。未发布的图片需登录才可查看。</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const file = f.get("file") as File;
              setBusy(true);
              try {
                const r = await fetch("/api/content-media", {
                  method: "POST",
                  headers: {
                    "x-image-alt": encodeURIComponent(String(f.get("alt"))),
                    "x-image-rights": encodeURIComponent(String(f.get("rights"))),
                  },
                  body: file,
                });
                const d = await r.json();
                if (!r.ok) throw Error(d.error);
                await load();
                setMessage("图片已保存，可在正文中选择");
              } catch (e) {
                setMessage((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              图片
              <input required name="file" type="file" accept="image/jpeg,image/png,image/webp" />
            </label>
            <label>
              图片说明
              <input required name="alt" />
            </label>
            <label>
              使用权来源
              <input required name="rights" />
            </label>
            <button disabled={busy || !canEdit}>上传图片</button>
          </form>
          {data.media.map((m: any) => (
            <p key={m.id}>
              <a href={`/api/content-media/${m.id}`} target="_blank" rel="noreferrer">
                {m.alt}
              </a>{" "}
              · {m.rights}
            </p>
          ))}
        </section>
      )}
      {tab === "agent" && (
        <section className="panel">
          <h2>AI 内容任务</h2>
          <p className="notice">
            模型账户尚未配置，当前不会发送材料或调用付费模型。可以保存任务，配置完成后再执行。AI不能发布内容。
          </p>
          <p>
            当前选定工作稿：{selected?.title || "未选择（采纳时创建新稿）"}
            。粘贴材料和所选来源将作为任务输入，不读取客户咨询。
          </p>
          <label>
            任务类型
            <select value={taskKind} onChange={(e) => setTaskKind(e.target.value)}>
              <option value="draft">内容起草</option>
              <option value="research">资料整理</option>
              <option value="translate">多语言翻译</option>
              <option value="check">发布前检查</option>
            </select>
          </label>
          {taskKind === "translate" && (
            <label>
              目标语言
              <select value={targetLocale} onChange={(e) => setTargetLocale(e.target.value)}>
                {catalogLanguages.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.zh}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            任务要求
            <input value={taskText} onChange={(e) => setTaskText(e.target.value)} />
          </label>
          <label>
            公开资料（最多20000字符）
            <textarea
              maxLength={20000}
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
            />
          </label>
          <button disabled={busy || !editable} onClick={() => task("create")}>
            保存任务
          </button>
          {data.tasks.map((t: any) => (
            <div className="block" key={t.id}>
              <h3>{t.title}</h3>
              <p>
                {states[t.status] || t.status} · 尝试 {t.attempts || 0} 次 · 费用
                {t.usage?.cost === undefined ? "未知" : t.usage.cost}
              </p>
              <p>{t.error}</p>
              {t.result && (
                <>
                  <h4>{t.result.title}</h4>
                  <p>{t.result.summary}</p>
                  {t.result.housekeepingText && (
                    <details>
                      <summary>家政结构化译文（请逐项核对）</summary>
                      <pre>{JSON.stringify(t.result.housekeepingText, null, 2)}</pre>
                    </details>
                  )}
                  {t.result.lifestyleText && (
                    <details>
                      <summary>结构化资料翻译</summary>
                      <dl>
                        {Object.entries(t.result.lifestyleText).map(([k, v]) => (
                          <div key={k}>
                            <dt>{lifeText("zh", k)}</dt>
                            <dd>{String(v)}</dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                  )}
                  <ul>
                    {t.result.questions?.map((q: string, i: number) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                  <details>
                    <summary>查看候选内容</summary>
                    <pre style={{ whiteSpace: "pre-wrap" }}>
                      {JSON.stringify(t.result, null, 2)}
                    </pre>
                  </details>
                </>
              )}
              <button
                disabled={busy || !canEdit || t.status === "running"}
                onClick={() => task("run", t.id)}
              >
                执行／重试
              </button>
              <button disabled={busy || !canEdit} onClick={() => task("cancel", t.id)}>
                取消
              </button>
              {t.status === "succeeded" && (
                <button
                  disabled={busy || !canEdit || !!t.adoptedDraft}
                  onClick={() => task("adopt", t.id)}
                >
                  {t.adoptedDraft ? "已采纳" : "采纳为待审核草稿"}
                </button>
              )}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
