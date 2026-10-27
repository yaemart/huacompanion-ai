"use client";
import {
  contentSections,
  sectionFor,
  filterContent,
} from "@/lib/content-sections";
import { catalogCities } from "@/lib/catalog-options";
import { CatalogFields } from "./CatalogFields";
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
    ...(isCatalog(initialKind)
      ? { kind: initialKind as ContentBody["kind"], catalog: emptyCatalog() }
      : {}),
  }));
  const [kindFilter, setKindFilter] = useState(initialKind);
  const [cityFilter, setCityFilter] = useState("");
  const [publicationFilter, setPublicationFilter] = useState("");
  const [providerRef, setProviderRef] = useState("");
  const [catalogReviewed, setCatalogReviewed] = useState(false);
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
  const [taskKind, setTaskKind] = useState("draft");
  async function load() {
    const r = await fetch("/api/content-center", { cache: "no-store" });
    const d = await r.json();
    if (!r.ok) throw Error(d.error);
    setData(d);
    return d;
  }
  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, []);
  function select(d: any) {
    setSelected(d);
    setProviderRef(d.providerRef ? String(d.providerRef) : "");
    setCatalogReviewed(false);
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
                ...(body.kind === "provider-profile" && data.role === "admin"
                  ? { providerRef: providerRef ? Number(providerRef) : null }
                  : {}),
              }
            : {}),
          ...(action === "publish" ? { catalogReviewed } : {}),
          ...extra,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
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
      [key]: value,
      ...(key === "kind" && isCatalog(value) && !body.catalog
        ? { catalog: emptyCatalog() }
        : {}),
    });
    setCatalogReviewed(false);
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
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
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
      <style>{`.content-center{max-width:1250px;margin:auto;padding:32px 24px;color:#183e35}.content-center h1{font-size:36px}.content-center h2{font-size:24px}.content-center button,.content-center input,.content-center select,.content-center textarea{font:inherit;padding:10px;border:1px solid #9aafa5;border-radius:6px}.content-center button{cursor:pointer;background:#edf3ed;margin:4px}.content-center button:disabled{opacity:.5;cursor:wait}.content-center input,.content-center textarea,.content-center select{width:100%;background:white}.content-center label{display:block;margin:14px 0}.content-center textarea{min-height:100px}.content-center .workspace{display:grid;grid-template-columns:280px 1fr;gap:24px}.content-center .panel{padding:20px;border:1px solid #cbd8ce;border-radius:12px;background:#fafcf9}.content-center .row{display:flex;gap:12px}.content-center .row>*{flex:1}.content-center aside.panel{max-height:75vh;overflow-y:auto;overflow-x:hidden}.content-center .item{display:block;width:100%;margin:4px 0;text-align:left}.content-center .notice{padding:16px;background:#edf2dc;white-space:pre-wrap}.content-center small{display:block}.content-center .block{padding:10px;margin:12px 0;border:1px solid #d1dcd1}@media(max-width:750px){.content-center .workspace{grid-template-columns:1fr}.content-center .row{display:block}.content-center aside.panel{max-height:35vh}}`}</style>
      <a href="/admin">← 中文管理后台</a>
      <h1>
        {initialKind === "provider-profile"
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
        <a href="/content-center?kind=provider-profile">服务商展示内容</a>
        <a href="/content-center?kind=service-project">华伴服务项目</a>
      </nav>
      {isCatalog(initialKind) && (
        <p>
          在此新建、编辑、预览和审核发布展示内容。服务商入驻申请与合作许可仍在业务后台单独管理。
        </p>
      )}
      <p>
        编辑与 AI 生成的内容先进入草稿，只有管理员审核后才能发布。网站与未来 App
        共用正式内容。
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
              onClick={() => {
                setSelected(null);
                setBody({
                  ...empty(),
                  ...(isCatalog(kindFilter)
                    ? {
                        kind: kindFilter as ContentBody["kind"],
                        catalog: emptyCatalog(),
                      }
                    : {}),
                });
                setProviderRef("");
                setCatalogReviewed(false);
                setVersions([]);
              }}
            >
              {kindFilter === "provider-profile"
                ? "＋ 新建服务商展示"
                : kindFilter === "service-project"
                  ? "＋ 新建服务项目"
                  : "＋ 新建内容"}
            </button>
            <label>
              内容库
              <select
                value={kindFilter}
                onChange={(e) => setKindFilter(e.target.value)}
              >
                <option value="">全部类型</option>
                {Object.entries(kinds).map(([v, l]) => (
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
                <option value="live">公开可咨询</option>
                <option value="paused">暂停／受限制</option>
                <option value="offline">未发布／已下架</option>
              </select>
            </label>
            <label>
              服务城市
              <select
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
              >
                <option value="">全部城市</option>
                {catalogCities.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.zh}
                  </option>
                ))}
              </select>
            </label>
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
              <select
                value={section}
                onChange={(e) => setSection(Number(e.target.value))}
              >
                <option value={0}>全部板块</option>
                {contentSections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.zh}（
                    {
                      data.drafts.filter(
                        (d: any) => sectionFor(d.body) === s.id,
                      ).length
                    }
                    ）
                  </option>
                ))}
              </select>
            </label>
            <div className="row">
              <label>
                语言
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <option value="">全部</option>
                  <option value="zh">中文</option>
                  <option value="en">英文</option>
                </select>
              </label>
              <label>
                审核状态
                <select
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                >
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
                      const pub = data.published.find(
                        (p: any) => p.draftId === d.id,
                      );
                      return publicationFilter === "live"
                        ? pub?.visible && pub?.acceptingInquiries !== false
                        : publicationFilter === "paused"
                          ? pub?.active &&
                            (!pub?.visible || pub?.acceptingInquiries === false)
                          : !pub?.active;
                    })()) &&
                  (!kindFilter || d.kind === kindFilter) &&
                  (!cityFilter ||
                    d.body.catalog?.cities.some(
                      (c: any) => c.code === cityFilter,
                    )),
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
                  {contentSections.find((s) => s.id === sectionFor(d.body))?.zh}{" "}
                  · {d.locale} · {kinds[d.kind as keyof typeof kinds]} ·{" "}
                  {states[d.reviewState]}
                  {data.published.some(
                    (p: any) => p.draftId === d.id && p.visible,
                  )
                    ? data.published.find((p: any) => p.draftId === d.id)
                        ?.acceptingInquiries === false
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
            <fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
              <div className="row">
                <label>
                  内容类型
                  <select
                    value={body.kind}
                    disabled={!!selected}
                    onChange={(e) => field("kind", e.target.value)}
                  >
                    {Object.entries(kinds).map(([v, l]) => (
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
                    <option value="zh">中文</option>
                    <option value="en">英文</option>
                  </select>
                </label>
              </div>
              <label>
                内容标识（中英文共用，例如 arrival-guide）
                <input
                  value={body.contentKey}
                  disabled={!!selected}
                  onChange={(e) => field("contentKey", e.target.value)}
                />
              </label>
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
                <input
                  value={body.title}
                  onChange={(e) => field("title", e.target.value)}
                />
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
                    value={body.category || 1}
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
                    choices={data.drafts.filter(
                      (d: any) => d.locale === body.locale,
                    )}
                  />
                  {body.kind === "provider-profile" &&
                    (data.role === "admin" ? (
                      <label>
                        关联内部服务商
                        <select
                          value={providerRef}
                          onChange={(e) => {
                            setProviderRef(e.target.value);
                            setCatalogReviewed(false);
                          }}
                        >
                          <option value="">请选择已入驻的服务商</option>
                          {(data.providers || []).map((p: any) => (
                            <option value={p.id} key={p.id}>
                              {p.name} ·{" "}
                              {p.publicApproved &&
                              ["verified", "contracted"].includes(p.status)
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
                  <label>
                    <input
                      type="checkbox"
                      style={{ width: "auto" }}
                      checked={catalogReviewed}
                      onChange={(e) => setCatalogReviewed(e.target.checked)}
                    />{" "}
                    我已检查公开文字、图片、核验事项与价格，不含直联联系方式、二维码或内部资料。
                  </label>
                  <p>先保存修改，再提交审核。管理员发布时需勾选以上检查。</p>
                </>
              )}
              <h2>正文</h2>
              {body.blocks.map((b, i) => (
                <div className="block" key={i}>
                  <select
                    aria-label={`段落${i + 1}类型`}
                    value={b.type}
                    onChange={(e) =>
                      block(i, { type: e.target.value as Block["type"] })
                    }
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
                      onChange={(e) =>
                        block(i, { mediaId: Number(e.target.value) })
                      }
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
                onClick={() =>
                  field("blocks", [
                    ...body.blocks,
                    { type: "paragraph", text: "" },
                  ])
                }
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
                        body.sources.map((x, j) =>
                          i === j ? { ...x, url: e.target.value } : x,
                        ),
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
              <button onClick={() => action("save")}>保存草稿</button>
              {selected && (
                <>
                  <a
                    href={`/content-preview/${selected.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    预览已保存工作稿 ↗
                  </a>
                  <button onClick={() => action("submit")}>
                    提交已保存稿审核
                  </button>
                  {data.role === "admin" && (
                    <>
                      <button onClick={() => action("publish")}>
                        审核并发布已保存稿
                      </button>
                      <button
                        onClick={() =>
                          action("return", {
                            note: prompt("退回修改意见") || "请修改后重新提交",
                          })
                        }
                      >
                        退回修改
                      </button>
                      <button onClick={() => action("unpublish")}>下架</button>
                    </>
                  )}
                  <button
                    onClick={async () => {
                      const r = await fetch(
                        `/api/content-center?versions=${selected.id}`,
                      );
                      const d = await r.json();
                      if (r.ok) setVersions(d.versions);
                      else setMessage(d.error);
                    }}
                  >
                    历史版本
                  </button>
                  <p>发布及预览只使用已保存版本；请先保存正在编辑的内容。</p>
                  {data.drafts
                    .filter(
                      (d: any) =>
                        d.contentKey === body.contentKey &&
                        d.locale !== body.locale,
                    )
                    .map((d: any) => (
                      <p key={d.id}>
                        <button onClick={() => select(d)}>
                          打开 {d.locale} 对应内容
                        </button>
                        {d.sourceRevision &&
                        d.sourceRevision !== selected.revision
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
                    onClick={() => action("restore", { versionId: v.id })}
                  >
                    恢复为新草稿
                  </button>
                </p>
              ))}
            </fieldset>
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
                    "x-image-rights": encodeURIComponent(
                      String(f.get("rights")),
                    ),
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
              <input
                required
                name="file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
              />
            </label>
            <label>
              图片说明
              <input required name="alt" />
            </label>
            <label>
              使用权来源
              <input required name="rights" />
            </label>
            <button disabled={busy}>上传图片</button>
          </form>
          {data.media.map((m: any) => (
            <p key={m.id}>
              <a
                href={`/api/content-media/${m.id}`}
                target="_blank"
                rel="noreferrer"
              >
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
            <select
              value={taskKind}
              onChange={(e) => setTaskKind(e.target.value)}
            >
              <option value="draft">内容起草</option>
              <option value="research">资料整理</option>
              <option value="translate">中英文翻译</option>
              <option value="check">发布前检查</option>
            </select>
          </label>
          <label>
            任务要求
            <input
              value={taskText}
              onChange={(e) => setTaskText(e.target.value)}
            />
          </label>
          <label>
            公开资料（最多20000字符）
            <textarea
              maxLength={20000}
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
            />
          </label>
          <button disabled={busy} onClick={() => task("create")}>
            保存任务
          </button>
          {data.tasks.map((t: any) => (
            <div className="block" key={t.id}>
              <h3>{t.title}</h3>
              <p>
                {states[t.status] || t.status} · 尝试 {t.attempts || 0} 次 ·
                费用{t.usage?.cost === undefined ? "未知" : t.usage.cost}
              </p>
              <p>{t.error}</p>
              {t.result && (
                <>
                  <h4>{t.result.title}</h4>
                  <p>{t.result.summary}</p>
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
                disabled={busy || t.status === "running"}
                onClick={() => task("run", t.id)}
              >
                执行／重试
              </button>
              <button disabled={busy} onClick={() => task("cancel", t.id)}>
                取消
              </button>
              {t.status === "succeeded" && (
                <button
                  disabled={busy || !!t.adoptedDraft}
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
