"use client";
import { staffDate, staffVersion } from "@/lib/staff-display";
import "./content-center.css";
import { requestContentReturn } from "@/lib/content-return";
import { readStaffFormResponse, staffFormMessage } from "@/lib/staff-form-feedback";
import { fixedContentPages, fixedSlugForKey } from "@/lib/content-identifiers";
import { PolicyBannerFields, usePolicyBannerChoices } from "./PolicyBannerFields";
import { isPolicyBannerLocale } from "@/lib/policy-banner-picker";
import {
  requiresSourceDates,
  sourceTopics,
  type VisaSourceKeys,
} from "@/lib/content-source-verification";
import { ArticleEditor } from "./ArticleEditor";
import { GuideReference } from "./GuideReference";
import {
  guideTargetLocale,
  prefillGuideTranslation,
  type GuideTranslation,
} from "@/lib/guide-translation";
import type { ContentDraft, ContentMedia } from "../../../payload-types";
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
import { emptyExhibition, effectiveExhibitionStatus, shanghaiToday } from "@/lib/exhibitions";
import { isCatalog, emptyCatalog } from "@/lib/catalog";
import { useEffect, useMemo, useRef, useState } from "react";
import { mergeSavedDraft, type DraftSaveResult } from "@/lib/editor-draft-autosave";
import { MobileSaveBar, StaffEditorGroup } from "@/components/admin/StaffMobileEditor";
import { StaffActionButton } from "@/components/admin/StaffActionButton";
import {
  actionInProgress,
  contentPublishReason,
  draftEditReason,
  saveChangesFirst,
} from "@/lib/staff-action-reasons";
import { useDraftAutosave, useUnsavedDraft } from "@/components/admin/useDraftProtection";
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
const reviewLabels = {
  catalog: "已核验公开资料、图片权利及服务范围，不含内部联系方式。",
  exhibition: "已核验官方来源、展期、地址和报名条件。",
  life: "已人工核实来源、营业或活动时间、收费、语言和参加要求。",
  institution: "已核验官方来源、资质说明、接待条件及服务语言。",
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
function showDraftInURL(id?: number) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("id", String(id));
  else url.searchParams.delete("id");
  window.history.replaceState(null, "", url);
}

export function ContentCenter({
  initialKind = "",
  initialDraftID,
  policyBannersEnabled = false,
  contentAIAvailable = false,
  visaKeys = { guide: undefined, faq: [] },
}: {
  initialKind?: string;
  initialDraftID?: number;
  policyBannersEnabled?: boolean;
  contentAIAvailable?: boolean;
  visaKeys?: VisaSourceKeys;
}) {
  const [data, setData] = useState<any>({
    drafts: [],
    published: [],
    media: [],
    tasks: [],
  });
  const [editSession, setEditSession] = useState(0);
  const [selected, setSelected] = useState<any>(null);
  const openedTarget = useRef(false);
  useEffect(() => {
    if (!openedTarget.current && initialDraftID && selected?.id === initialDraftID) {
      document.getElementById("today-content-target")?.focus();
      openedTarget.current = true;
    }
  }, [initialDraftID, selected?.id]);
  const [guideReference, setGuideReference] = useState<ContentDraft | null>(null);
  const listRequest = useRef(0);
  const comparisonRequest = useRef(0);
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
  const savedForm = useRef(body);
  const savedProvider = useRef("");
  const writing = useRef(false);
  const createUnconfirmed = useRef(false);
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
  const fixedPageLocked =
    selected?.kind === "page" &&
    (!!fixedSlugForKey(selected.contentKey) ||
      data.drafts.some(
        (draft: Pick<ContentDraft, "id" | "kind" | "contentKey">) =>
          draft.id !== selected.id &&
          draft.kind === "page" &&
          draft.contentKey === selected.contentKey,
      ));
  const selfReview =
    !!selected &&
    [
      ...(Array.isArray(selected.contributors) ? selected.contributors : []),
      selected.lastEditedBy,
      selected.submittedBy,
    ].some((id) => id != null && String(id) === String(permissions.userId));
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const dirty = body !== savedForm.current || providerRef !== savedProvider.current;
  const draftInput = useMemo(() => ({ body, providerRef }), [body, providerRef]);
  const activeEdits = useRef(false);
  activeEdits.current = dirty;
  const { confirmDiscard } = useUnsavedDraft(dirty);
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
  const bannerLocale = isPolicyBannerLocale(body.locale) ? body.locale : null;
  const datesRequired = requiresSourceDates(body, visaKeys);
  const canChooseBanner = policyBannersEnabled && editable && !!bannerLocale && tab === "content";
  const bannerLookup = usePolicyBannerChoices(
    body.kind,
    body.locale,
    canChooseBanner && body.blocks.some(({ type }) => type === "policy-banner"),
  );
  const guideLocale = selected?.kind === "guide" ? guideTargetLocale(selected.locale) : null;
  const existingGuide =
    guideLocale &&
    data.drafts.some(
      (draft: ContentDraft) =>
        draft.kind === "guide" &&
        draft.contentKey === selected.contentKey &&
        draft.locale === guideLocale,
    );
  const guideChanged =
    !!guideReference &&
    (data.drafts.some(
      (draft: ContentDraft) =>
        draft.id === guideReference.id && draft.revision > guideReference.revision,
    ) ||
      (selected?.sourceDraft === guideReference.id &&
        selected.sourceRevision < guideReference.revision));
  async function load() {
    const request = ++listRequest.current;
    const r = await fetch(
      initialDraftID ? `/api/content-center?draft=${initialDraftID}` : "/api/content-center",
      {
        cache: "no-store",
      },
    );
    const d = await r.json();
    if (request !== listRequest.current) return null;
    if (!r.ok) {
      if ([401, 403].includes(r.status)) {
        setData({ drafts: [], published: [], media: [], tasks: [] });
        if (activeEdits.current) {
          throw Error("当前无法保存。请保留填写内容，并重新登录或确认编辑权限。");
        }
        setSelected(null);
        comparisonRequest.current++;
        setGuideReference(null);
        setBody(empty());
        window.location.assign("/admin/login");
      }
      throw Error(d.error);
    }
    setData(d);
    const guideAccess = d.permissions.canEdit && d.permissions.contentKinds.includes("guide");
    if (!guideAccess) {
      comparisonRequest.current++;
      setGuideReference(null);
    }
    if (activeEdits.current || writing.current) return d;
    setSelected((previous: any) => {
      if (previous && !d.drafts.some((draft: any) => draft.id === previous.id)) {
        if (previous.kind === "guide" && guideAccess && d.draftsTruncated) return previous;
        const clean = empty();
        savedForm.current = clean;
        savedProvider.current = "";
        setProviderRef("");
        setBody(clean);
        return null;
      }
      return previous;
    });
    return d;
  }
  useEffect(() => {
    let initializing = true;
    load()
      .then((d) => {
        if (!d) return;
        if (initialDraftID) {
          const draft = d.drafts.find((draft: ContentDraft) => draft.id === initialDraftID);
          if (draft) {
            select(draft);
            return;
          }
          setMessage("这篇草稿已不可访问，请返回今日待办刷新。");
        }
        const permitted = d.permissions?.contentKinds || [];
        const kind = permitted.includes(initialKind) ? initialKind : permitted[0];
        if (kind) {
          const clean = {
            ...empty(),
            kind,
            ...(isLife(kind) ? { lifestyle: emptyLifestyle(kind) } : {}),
            ...(kind === "institution" ? { institution: emptyInstitution() } : {}),
            ...(kind === "exhibition" ? { exhibition: emptyExhibition() } : {}),
            ...(isCatalog(kind) ? { catalog: emptyCatalog() } : {}),
          };
          savedForm.current = clean;
          setBody(clean);
          if (initialKind && !permitted.includes(initialKind)) setKindFilter("");
        }
      })
      .catch((e) => setMessage(e.message))
      .finally(() => {
        initializing = false;
      });
    const refresh = () => {
      if (!initializing) load().catch((e) => setMessage(e.message));
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  function select(d: any, reference: ContentDraft | null = null) {
    listRequest.current++;
    setEditSession((session) => session + 1);
    showDraftInURL(d?.id);
    setSelected(d);
    setGuideReference(reference);
    setOverrideReason("");
    savedProvider.current = d?.providerRef ? String(d.providerRef) : "";
    setProviderRef(savedProvider.current);
    createUnconfirmed.current = false;
    setCatalogReviewed(false);
    setExhibitionReviewed(false);
    setInstitutionReviewed(false);
    setLifeReviewed(false);
    const locale = reference && guideTargetLocale(reference.locale);
    const next = d
      ? { ...d.body, category: sectionFor(d.body) }
      : reference && locale
        ? prefillGuideTranslation(reference, locale)
        : empty();
    savedForm.current = next;
    setBody(next);
    setVersions([]);
    setMessage("");
    setFormError("");
  }
  async function compareGuide(mode: "open" | "refresh" | "existing" | "back") {
    const id = mode === "open" ? selected?.id : guideReference?.id;
    if (!id || busy || writing.current) return;
    if (mode === "open" && dirty) return setMessage("请先保存本稿修改，再打开双语对照。");
    const request = ++comparisonRequest.current;
    setBusy(true);
    try {
      const r = await fetch(`/api/content-center?guideTranslation=${id}`, { cache: "no-store" });
      const result = await r.json();
      if (request !== comparisonRequest.current) return;
      if (!r.ok) throw Error(result.error);
      const { source, target }: GuideTranslation = result;
      if (mode === "refresh") {
        setGuideReference(source);
        return setMessage("已读取最新原文，右侧译文保留。");
      }
      if (mode === "existing" && !target) return setMessage("该语言还没有已保存的草稿。");
      if (mode !== "open" && !confirmDiscard()) return;
      if (mode === "back") select(source);
      else select(target, source);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function action(
    action: string,
    extra: any = {},
    automatic = false,
  ): Promise<DraftSaveResult> {
    if (writing.current || busy || (action === "submit" && dirty)) return "blocked";
    if (["restore", "unpublish"].includes(action) && !confirmDiscard()) return "blocked";
    if (action === "save" && !selected && createUnconfirmed.current) {
      setFormError("首次保存结果未确认。请复制当前填写并从列表核对是否已建稿，再继续。");
      return "blocked";
    }
    if (
      action === "save" &&
      body.blocks.some(({ type, text }) => type === "policy-banner" && !text)
    ) {
      setFormError("请先选择已发布政策，或移除空横幅后保存。");
      return "blocked";
    }
    if (
      action === "save" &&
      (body.blocks.length > 200 ||
        body.blocks.some(
          ({ type, text }) =>
            type !== "image" && type !== "policy-banner" && (text?.length ?? 0) > 10000,
        ))
    ) {
      setFormError("正文最多 200 段，每段最多 10,000 字。请缩短或拆分后保存。");
      return "blocked";
    }
    writing.current = true;
    listRequest.current++;
    if (!automatic) setBusy(true);
    setMessage("");
    setFormError("");
    const fallback = "草稿操作未得到确认，请保留当前填写，稍后重试。";
    const firstSave = action === "save" && !selected;
    if (firstSave) createUnconfirmed.current = true;
    let retryable = !!selected;
    try {
      const r = await fetch("/api/content-center", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...(automatic && { autosave: true }),
          id: selected?.id,
          revision: selected?.revision,
          ...(action === "save"
            ? {
                body,
                ...(!selected && guideReference
                  ? { guideSource: { id: guideReference.id, revision: guideReference.revision } }
                  : {}),
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
      retryable = !!selected && (r.status >= 500 || r.ok);
      if (firstSave && r.status >= 400 && r.status < 500) createUnconfirmed.current = false;
      if (!automatic && [401, 403].includes(r.status)) await load().catch(() => {});
      const d = await readStaffFormResponse<ContentDraft>(r, fallback);
      if (!Number.isSafeInteger(d.id) || d.id < 1 || !Number.isSafeInteger(d.revision))
        throw Error(fallback);
      createUnconfirmed.current = false;
      if (automatic) {
        listRequest.current++;
        const draftBody = d.body as unknown as ContentBody;
        // The server validates and projects these blocks. Reuse the submitted nodes so the
        // article editor keeps the cursor, undo stack and any in-progress link edits.
        const next = { ...draftBody, blocks: body.blocks, category: sectionFor(draftBody) };
        const nextProvider = d.providerRef ? String(d.providerRef) : "";
        savedForm.current = next;
        savedProvider.current = nextProvider;
        setBody((current) => mergeSavedDraft(body, next, current));
        setProviderRef((current) => (current === providerRef ? nextProvider : current));
        setSelected(d);
        if (firstSave) showDraftInURL(d.id);
        setData((current: typeof data) => ({
          ...current,
          drafts: [d, ...current.drafts.filter((draft: ContentDraft) => draft.id !== d.id)],
        }));
        return "saved";
      }
      select(d, guideReference);
      const refreshed = await load().then(
        () => true,
        () => false,
      );
      setMessage(
        (action === "publish"
          ? "已发布到本地网站"
          : action === "unpublish"
            ? "已下架"
            : "已保存；修改不会改变当前已发布版本") + (refreshed ? "" : "；列表暂未刷新"),
      );
      return "saved";
    } catch (e) {
      setFormError(
        firstSave && createUnconfirmed.current
          ? "首次保存结果未确认。请复制当前填写并从列表核对是否已建稿，再继续。"
          : staffFormMessage(e, fallback),
      );
      return retryable ? "retry" : "blocked";
    } finally {
      writing.current = false;
      if (!automatic) setBusy(false);
    }
  }
  const autosave = useDraftAutosave({
    editable: editable && tab === "content" && allowedKinds.includes(body.kind),
    dirty,
    busy,
    fingerprint: draftInput,
    session: editSession,
    save: () => action("save", {}, true),
  });
  const saving = busy || autosave.syncing;
  const savingReason = saving ? actionInProgress : undefined;
  const waiting = selected?.reviewState === "review";
  const publishedVersion =
    selected &&
    data.published.find(
      (record: { draftId: number; visible: boolean; revision: number }) =>
        record.draftId === selected.id && record.visible,
    );
  const editReason =
    savingReason ||
    (data.permissions
      ? draftEditReason(canEdit, waiting)
      : message
        ? "暂时无法读取编辑权限，请刷新页面。"
        : "正在读取编辑权限，请稍候。");
  const reviewVerification = [
    isCatalog(body.kind) && !catalogReviewed && reviewLabels.catalog,
    body.kind === "exhibition" && !exhibitionReviewed && reviewLabels.exhibition,
    isLife(body.kind) && !lifeReviewed && reviewLabels.life,
    body.kind === "institution" && !institutionReviewed && reviewLabels.institution,
  ].find((label) => typeof label === "string");
  const creating = !selected && autosave.syncing;
  function chooseDraft(draft: ContentDraft) {
    if (!writing.current && draft.id !== selected?.id && confirmDiscard()) select(draft);
  }
  function field(key: keyof ContentBody, value: any) {
    setBody({
      ...body,
      [key]:
        key === "catalog" && value?.categories?.includes("housekeeping")
          ? { ...value, housekeeping: value.housekeeping || emptyHousekeeping() }
          : value,
      ...(key === "kind" && isLife(value) ? { lifestyle: emptyLifestyle(value) } : {}),
      ...(key === "kind" && (value === "page" || body.kind === "page") ? { slug: "" } : {}),
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
  let articleStart = 0;
  const articleParts = [...body.blocks, null].flatMap((b, i) => {
    if (b && b.type !== "image" && b.type !== "policy-banner") return [];
    const first = articleStart;
    articleStart = i + 1;
    return [{ b, i, first }];
  });
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
        {contentAIAvailable ? "编辑与 AI 生成的内容" : "编辑内容"}
        先进入草稿，只有授权审核员核验后才能发布。网站与未来 App 共用已发布版本。
      </p>
      <nav>
        {[
          ["content", "编辑与发布"],
          ["media", "图片素材"],
          ...(contentAIAvailable ? [["agent", "AI 内容任务"]] : []),
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
        <div className={guideReference ? "workspace guide-comparison" : "workspace"}>
          <aside className="panel" hidden={!!guideReference}>
            <button
              disabled={!canEdit || saving}
              onClick={() => {
                if (writing.current || !confirmDiscard()) return;
                listRequest.current++;
                setEditSession((session) => session + 1);
                showDraftInURL();
                setSelected(null);
                setGuideReference(null);
                const clean = {
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
                };
                savedForm.current = clean;
                savedProvider.current = "";
                createUnconfirmed.current = false;
                setBody(clean);
                setProviderRef("");
                setCatalogReviewed(false);
                setExhibitionReviewed(false);
                setInstitutionReviewed(false);
                setLifeReviewed(false);
                setVersions([]);
                setMessage("");
                setFormError("");
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
              <button className="item" key={d.id} disabled={saving} onClick={() => chooseDraft(d)}>
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
                      : " · 已发布版本"
                    : ""}
                </small>
              </button>
            ))}
          </aside>
          {guideReference && (
            <GuideReference
              key={guideReference.id}
              source={guideReference}
              changed={guideChanged}
              busy={saving}
              onBack={() => compareGuide("back")}
              onRefresh={() => compareGuide("refresh")}
              onExisting={selected ? undefined : () => compareGuide("existing")}
            />
          )}
          <section className="panel">
            <h2 id="today-content-target" tabIndex={-1}>
              {guideReference ? "编辑译文" : selected ? "编辑草稿" : "新建草稿"}
            </h2>
            {selected && <p>草稿 · {staffVersion(selected.revision)}</p>}
            {publishedVersion && <p>已发布版本 · {staffVersion(publishedVersion.revision)}</p>}
            {!guideReference && canEdit && guideLocale && (
              <button disabled={saving} onClick={() => compareGuide("open")}>
                {existingGuide ? "打开" : "添加"}
                {guideLocale === "en" ? "英文版" : "中文版"}
              </button>
            )}
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
              <StaffEditorGroup title="内容类型与语言" mobileHeading>
                <div className="row">
                  <label>
                    内容类型
                    <select
                      value={body.kind}
                      disabled={!!selected || !!guideReference || creating}
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
                      disabled={!!selected || !!guideReference || creating}
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
                {body.kind === "page" && (
                  <label>
                    网站页面
                    <select
                      value={body.slug}
                      disabled={selected?.everPublished || fixedPageLocked || creating}
                      onChange={(e) => field("slug", e.target.value)}
                    >
                      <option value="">请选择要编辑的页面</option>
                      {fixedContentPages.map(({ slug, label }) => (
                        <option value={slug} key={slug}>
                          {label}
                        </option>
                      ))}
                    </select>
                    {fixedPageLocked && <small>该草稿已关联此固定页面，其他页面请另建草稿。</small>}
                  </label>
                )}
              </StaffEditorGroup>
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
                <p>同一届展会的各语言版本共用内容编号。下一届请新建，保留往届记录。</p>
              )}
              <StaffEditorGroup title="基本信息" mobileHeading>
                <label>
                  标题
                  <input value={body.title} onChange={(e) => field("title", e.target.value)} />
                </label>
                <details key={selected?.id ?? "new-content"} className="content-identifiers">
                  <summary>高级</summary>
                  <p>
                    {selected
                      ? "内容编号保持不变，曾发布的网址不能修改。"
                      : "这两项可留空，第一次保存时由系统生成。"}
                  </p>
                  <label>
                    内容编号（同一内容的各语言版本共用）
                    <input
                      value={body.contentKey}
                      disabled={!!selected || !!guideReference || creating}
                      maxLength={100}
                      placeholder="首次保存时生成"
                      onChange={(e) => field("contentKey", e.target.value)}
                    />
                  </label>
                  <label>
                    网址末尾（小写英文字母、数字和短横线）
                    <input
                      value={body.slug}
                      disabled={
                        creating ||
                        body.kind === "page" ||
                        selected?.everPublished ||
                        (!!guideReference && !selected)
                      }
                      maxLength={100}
                      placeholder={body.kind === "page" ? "由网站页面决定" : "首次保存时生成"}
                      onChange={(e) => field("slug", e.target.value)}
                    />
                  </label>
                </details>
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
                        field(
                          "seoImage",
                          event.target.value ? Number(event.target.value) : undefined,
                        )
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
              </StaffEditorGroup>
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
              <StaffEditorGroup title="正文">
                <p>可直接粘贴整篇文章。选中文字可添加格式，点击已有链接可修改网址。</p>
                {articleParts.map(({ b, i, first }) => (
                  <div key={`${editSession}-${first}`}>
                    <ArticleEditor
                      blocks={body.blocks.slice(first, i)}
                      disabled={busy || !editable}
                      onChange={(next) =>
                        field("blocks", body.blocks.toSpliced(first, i - first, ...next))
                      }
                    />
                    {b?.type === "image" && (
                      <select
                        aria-label="选择图片"
                        value={b.mediaId || ""}
                        onChange={(e) => block(i, { mediaId: Number(e.target.value) })}
                      >
                        <option value="">请选择已上传图片</option>
                        {data.media.map((m: ContentMedia) => (
                          <option key={m.id} value={m.id}>
                            {m.alt}
                          </option>
                        ))}
                      </select>
                    )}
                    {b?.type === "policy-banner" ? (
                      <PolicyBannerFields
                        value={b}
                        locale={bannerLocale ?? "zh"}
                        lookup={canChooseBanner ? bannerLookup : undefined}
                        onChange={(patch) => block(i, patch)}
                      />
                    ) : b?.type === "image" ? (
                      <textarea
                        aria-label="图片说明"
                        value={b.text || ""}
                        onChange={(e) => block(i, { text: e.target.value })}
                      />
                    ) : null}
                    {b && (
                      <button
                        onClick={() =>
                          field(
                            "blocks",
                            body.blocks.filter((_, j) => j !== i),
                          )
                        }
                      >
                        {b.type === "image" ? "移除图片" : "移除政策横幅"}
                      </button>
                    )}
                  </div>
                ))}
                <button onClick={() => field("blocks", [...body.blocks, { type: "image" }])}>
                  ＋ 在文末添加图片
                </button>
                {policyBannersEnabled && bannerLocale && (
                  <button
                    onClick={() => field("blocks", [...body.blocks, { type: "policy-banner" }])}
                  >
                    ＋ 在文末添加政策横幅
                  </button>
                )}
              </StaffEditorGroup>
              <StaffEditorGroup title="资料来源">
                <label>
                  资料主题
                  <select
                    value={body.sourceTopic ?? ""}
                    onChange={(e) => field("sourceTopic", e.target.value || undefined)}
                  >
                    <option value="">未标记</option>
                    {Object.entries(sourceTopics).map(([topic, name]) => (
                      <option key={topic} value={topic}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <p>
                  {datesRequired
                    ? "送审和发布前，至少添加一条来源，并填写每条来源的人工核实日期。"
                    : "涉及政策、就医或签证的稿件请选择相应主题。"}
                </p>
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
                          body.sources.map((x, j) =>
                            i === j ? { ...x, title: e.target.value } : x,
                          ),
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
                      人工核实日期{datesRequired ? "（送审必填）" : "（可选）"}
                      <input
                        type="date"
                        required={datesRequired}
                        max={datesRequired ? shanghaiToday() : undefined}
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
              </StaffEditorGroup>
              <p>{selected?.reviewNote}</p>
            </fieldset>
            {selected?.reviewState === "review" && (
              <p>待审核内容已锁定编辑，请先由审核员退回再修改。</p>
            )}
            <MobileSaveBar>
              {formError && (
                <p role="alert" className="notice">
                  {formError}
                </p>
              )}
              {autosave.status && <p role="status">{autosave.status}</p>}
              <StaffActionButton
                reason={
                  editReason ||
                  (!allowedKinds.includes(body.kind) ? "请选择你有权限编辑的内容类型。" : undefined)
                }
                onClick={() => action("save")}
              >
                保存草稿
              </StaffActionButton>
            </MobileSaveBar>
            {selected && (
              <>
                <a href={`/content-preview/${selected.id}`} target="_blank" rel="noreferrer">
                  预览已保存草稿 ↗
                </a>
                {selected.everPublished && (
                  <p>
                    <a href={`/performance-center?source=content&record=${selected.id}`}>
                      登记发布后纠错
                    </a>
                  </p>
                )}
                <StaffActionButton
                  reason={editReason || (dirty ? saveChangesFirst : undefined)}
                  onClick={() => action("submit")}
                >
                  提交草稿审核
                </StaffActionButton>
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
                        {reviewLabels.catalog}
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
                        {reviewLabels.exhibition}
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
                        {reviewLabels.life}
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
                        {reviewLabels.institution}
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
                    <StaffActionButton
                      reason={contentPublishReason({
                        busy,
                        waiting,
                        own: selfReview,
                        isAdmin,
                        reason: overrideReason,
                        unchecked: reviewVerification,
                      })}
                      onClick={() => action("publish")}
                    >
                      审核并发布草稿
                    </StaffActionButton>
                    <StaffActionButton
                      reason={
                        busy ? actionInProgress : !waiting ? "请先将草稿提交审核。" : undefined
                      }
                      onClick={() =>
                        requestContentReturn(prompt, (note) => action("return", { note }))
                      }
                    >
                      退回修改
                    </StaffActionButton>
                    <StaffActionButton
                      reason={busy ? actionInProgress : undefined}
                      onClick={() => action("unpublish")}
                    >
                      下架
                    </StaffActionButton>
                  </>
                )}
                <button
                  disabled={busy}
                  onClick={async () => {
                    const r = await fetch(`/api/content-center?versions=${selected.id}`);
                    const d = await r.json();
                    if (r.ok) setVersions(d.versions);
                    else setMessage(d.error);
                  }}
                >
                  历史版本
                </button>
                <p>发布及预览只使用已保存的草稿；请先保存正在编辑的内容。</p>
                {data.drafts
                  .filter(
                    (d: any) =>
                      !guideReference &&
                      !(canEdit && guideLocale === d.locale) &&
                      d.kind === body.kind &&
                      d.locale !== body.locale &&
                      (body.kind === "page"
                        ? d.slug === body.slug
                        : d.contentKey === body.contentKey),
                  )
                  .map((d: any) => (
                    <p key={d.id}>
                      <button disabled={saving} onClick={() => chooseDraft(d)}>
                        打开 {d.locale} 对应内容
                      </button>
                      {d.sourceRevision && d.sourceRevision !== selected.revision
                        ? "原文已变化，译文需复核"
                        : ""}
                    </p>
                  ))}
              </>
            )}
            {versions.map((v) => (
              <p key={v.id}>
                {staffVersion(v.revision)} · {staffDate(v.updatedAt)}
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
      {contentAIAvailable && tab === "agent" && (
        <section className="panel">
          <h2>AI 内容任务</h2>
          <p className="notice">
            模型账户尚未配置，当前不会发送材料或调用付费模型。可以保存任务，配置完成后再执行。AI不能发布内容。
          </p>
          <p>
            当前选定草稿：{selected?.title || "未选择（采纳时创建新稿）"}
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
