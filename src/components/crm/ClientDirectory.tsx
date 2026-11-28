"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useUnsavedDraft } from "../admin/useDraftProtection";
import {
  beginCrmWrite,
  settleCrmWrite,
  crmOwnerLabel,
  type CrmWriteState,
} from "../../lib/crm-client";
import type { Client, Contact, Link, Candidate, Page, Options, View, Draft } from "./types";
import "./crm.css";
class ReadError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
async function read<T>(action: string, extra: Record<string, string | number> = {}): Promise<T> {
  const q = new URLSearchParams({ action });
  for (const [key, value] of Object.entries(extra)) q.set(key, String(value));
  const r = await fetch(`/api/crm?${q}`, { cache: "no-store" });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d)
    throw new ReadError(r.status, d?.error || "读取失败，请重试。当前填写不会被覆盖。");
  return d as T;
}
const emptyValues = { name: "", email: "", phone: "", jobTitle: "", reason: "" };
export default function ClientDirectory() {
  const [options, setOptions] = useState<Options>();
  const [list, setList] = useState<Page<Client>>();
  const [view, setView] = useState<View>();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("active");
  const [draft, setDraft] = useState<Draft>();
  const [message, setMessage] = useState("");
  const [denied, setDenied] = useState(false);
  const [pending, setPending] = useState<CrmWriteState>();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const writeRef = useRef<CrmWriteState | undefined>(undefined),
    sending = useRef(false);
  const editRef = useRef<HTMLElement>(null);
  const sequence = useRef(0),
    listSequence = useRef(0);
  const { confirmDiscard } = useUnsavedDraft(Boolean(draft) || Boolean(pending));
  const locked = busy || Boolean(pending);
  function failed(error: unknown) {
    setMessage(error instanceof Error ? error.message : "读取失败，请重试。");
    if (error instanceof ReadError && [401, 403].includes(error.status)) {
      sequence.current++;
      listSequence.current++;
      setDenied(true);
      setView(undefined);
      setList(undefined);
      setOptions(undefined);
    }
  }
  useEffect(() => {
    let active = true;
    const initialSequence = ++listSequence.current;
    Promise.all([read<Options>("options"), read<Page<Client>>("list")])
      .then(([o, l]) => {
        if (active && initialSequence === listSequence.current) {
          setOptions(o);
          setList(l);
        }
      })
      .catch((e) => {
        if (active && initialSequence === listSequence.current) failed(e);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    editRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    editRef.current
      ?.querySelector<HTMLElement>("input, select, textarea, button")
      ?.focus({ preventScroll: true });
  }, [draft?.action, draft?.base]);
  async function loadList(page = 1) {
    const seq = ++listSequence.current;
    try {
      const [o, l] = await Promise.all([
        read<Options>("options"),
        read<Page<Client>>("list", { q: query, status, page }),
      ]);
      if (seq === listSequence.current) {
        setOptions(o);
        setList(l);
      }
    } catch (e) {
      if (seq === listSequence.current) failed(e);
    }
  }
  async function loadView(id: number, pages = { contacts: 1, links: 1, candidates: 1 }) {
    const seq = ++sequence.current;
    setLoading(true);
    setView(undefined);
    try {
      const [client, contacts, links, candidates] = await Promise.all([
        read<Client>("get", { clientID: id }),
        read<Page<Contact>>("contacts", { clientID: id, page: pages.contacts }),
        read<Page<Link>>("linkedInquiries", { clientID: id, page: pages.links }),
        read<Page<Candidate>>("inquiryCandidates", { clientID: id, page: pages.candidates }),
      ]);
      if (seq === sequence.current) setView({ client, contacts, links, candidates });
    } catch (e) {
      if (seq === sequence.current) failed(e);
    } finally {
      if (seq === sequence.current) setLoading(false);
    }
  }
  function discard() {
    if (locked || !confirmDiscard()) return false;
    setDraft(undefined);
    return true;
  }
  function open(
    action: string,
    title: string,
    base: Record<string, unknown>,
    values: Record<string, string> = {},
  ) {
    if (!discard()) return;
    setMessage("");
    setDraft({ action, title, base, values: { ...emptyValues, ...values } });
  }
  function base() {
    return { clientID: view!.client.id, expectedClientRevision: view!.client.revision };
  }
  function values(key: string) {
    return draft?.values[key] ?? "";
  }
  function setValue(key: string, value: string) {
    setDraft((d) => (d ? { ...d, values: { ...d.values, [key]: value } } : d));
  }
  function payload(d: Draft) {
    const v = d.values,
      body: Record<string, unknown> = { action: d.action, ...d.base };
    if (["createClient", "updateClient"].includes(d.action)) {
      Object.assign(body, {
        displayName: v.displayName,
        language: v.language,
        countryCode: v.countryCode || null,
      });
      if (d.action === "createClient") {
        body.kind = v.kind;
        if (options?.role === "admin") body.teamID = Number(v.teamID);
        if (options?.role !== "operations") body.ownerID = v.ownerID ? Number(v.ownerID) : null;
      }
    } else if (d.action === "saveContact") {
      Object.assign(body, {
        name: v.name,
        email: v.email || null,
        phone: v.phone || null,
        jobTitle: v.jobTitle || null,
      });
    } else if (d.action !== "setPrimaryContact") body.reason = v.reason;
    return body;
  }
  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (sending.current || (!draft && !writeRef.current)) return;
    if (
      !writeRef.current &&
      draft?.action === "saveContact" &&
      !values("email") &&
      !values("phone")
    ) {
      setMessage("至少填写邮箱或电话。");
      return;
    }
    const operation = writeRef.current ?? beginCrmWrite(payload(draft!), crypto.randomUUID());
    writeRef.current = operation;
    setPending(operation);
    sending.current = true;
    setBusy(true);
    let code: number | undefined;
    try {
      const response = await fetch("/api/crm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: operation.payload,
      });
      code = response.status;
      const data = await response.json().catch(() => null);
      const original = JSON.parse(operation.payload) as Record<string, unknown>;
      const confirmed =
        response.ok &&
        Number.isSafeInteger(data?.clientID) &&
        data.clientID > 0 &&
        Number.isSafeInteger(data?.revision) &&
        data.revision > 0 &&
        (original.action === "createClient" || data.clientID === original.clientID);
      const next = settleCrmWrite(operation, code, confirmed);
      writeRef.current = next;
      setPending(next);
      if (confirmed) {
        setDraft(undefined);
        setMessage("操作已确认。以下为重新读取的资料。");
        await Promise.all([loadList(list?.page ?? 1), loadView(data.clientID)]);
      } else {
        if ([401, 403].includes(code))
          failed(new ReadError(code, "员工登录或权限已变化，请重新登录核对。"));
        else
          setMessage(
            `${data?.error || "未收到有效操作回执。"}${next ? " 原操作仍未确认，请重试原操作；不要新建或离开本页。" : " 当前输入已保留；如需更新版本，请先复制填写，取消表单、刷新详情后重新打开。"}`,
          );
      }
    } catch {
      const next = settleCrmWrite(operation, code, false);
      writeRef.current = next;
      setPending(next);
      setMessage("操作结果未知，原请求和填写已保留。请重试原操作，不要刷新或重复新建。");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  const active = view?.client.status === "active";
  const field = (name: string, label: string, required = false, type = "text", maxLength = 200) => (
    <label>
      {label}
      <input
        name={name}
        type={type}
        required={required}
        maxLength={maxLength}
        value={values(name)}
        onChange={(e) => setValue(name, e.target.value)}
      />
    </label>
  );
  return (
    <main className="crm-center">
      <header>
        <p className="crm-eyebrow">华伴 · 员工工作台</p>
        <h1>客户档案</h1>
        <p>管理客户资料与咨询归属。内部归档不会授予或收回客户登录访问权。</p>
        <a href="/admin">返回管理后台</a>
      </header>
      <p role="status" aria-live="polite" className="crm-message">
        {message}
      </p>
      {denied ? (
        <p>
          <a href="/admin/login">重新登录员工账号</a>。请先核对原操作结果。
        </p>
      ) : (
        <>
          <div className="crm-toolbar">
            <button
              disabled={locked || !options}
              onClick={() =>
                open(
                  "createClient",
                  "新建客户",
                  {},
                  {
                    kind: "individual",
                    language: "en",
                    displayName: "",
                    countryCode: "",
                    teamID: String(options?.teams[0]?.id ?? ""),
                    ownerID: "",
                  },
                )
              }
            >
              新建客户
            </button>
            <button disabled={busy} onClick={() => void loadList(list?.page ?? 1)}>
              重新载入列表
            </button>
          </div>
          <div className="crm-layout">
            <section aria-label="客户列表" className="crm-panel">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (discard()) void loadList();
                }}
              >
                <label>
                  搜索客户
                  <input maxLength={100} value={query} onChange={(e) => setQuery(e.target.value)} />
                </label>
                <label>
                  档案状态
                  <select value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="active">使用中</option>
                    <option value="archived">已存档</option>
                  </select>
                </label>
                <button disabled={locked}>查询</button>
              </form>
              {!list ? (
                <p>尚未读取客户列表。可重新载入。</p>
              ) : (
                <>
                  <p>当前范围内共 {list.total} 个客户</p>
                  <ul className="crm-cards">
                    {list.items.map((c) => (
                      <li key={c.id}>
                        <button
                          className="crm-open"
                          disabled={locked}
                          onClick={() => {
                            if (discard()) void loadView(c.id);
                          }}
                        >
                          {c.displayName}
                        </button>
                        <small>
                          {c.kind === "company" ? "企业" : "个人"} · {c.reference}
                        </small>
                      </li>
                    ))}
                  </ul>
                  {!list.items.length && <p>当前条件下没有客户。</p>}
                  <Pager
                    label="客户"
                    data={list}
                    disabled={locked || Boolean(draft)}
                    onPage={(n) => void loadList(n)}
                  />
                </>
              )}
            </section>
            <section className="crm-panel" aria-label="客户详情">
              {loading && <p>正在读取客户资料…</p>}
              {!loading && !view && <p>从左侧打开客户，或新建客户档案。</p>}
              {view && (
                <>
                  <h2>{view.client.displayName}</h2>
                  <p>
                    {view.client.reference} · 第 {view.client.revision} 版 ·{" "}
                    {active ? "使用中" : "已存档（只读）"}
                  </p>
                  <p>
                    语言：{view.client.language === "zh" ? "中文" : "英文"} · 国家／地区代码：
                    {view.client.countryCode || "未填写"}
                  </p>
                  <p>
                    所属团队：
                    {options?.teams.find((t) => t.id === view.client.teamID)?.name || "当前团队"} ·
                    负责人：
                    {crmOwnerLabel(
                      options?.role ?? "",
                      view.client.ownerID,
                      options?.owners.find((s) => s.id === view.client.ownerID)?.name,
                    )}
                  </p>
                  <div className="crm-actions">
                    <button disabled={locked} onClick={() => void loadView(view.client.id)}>
                      刷新详情
                    </button>
                    <button
                      disabled={locked || !active}
                      onClick={() =>
                        open(
                          "updateClient",
                          "修改客户资料",
                          { clientID: view.client.id, expectedRevision: view.client.revision },
                          {
                            displayName: view.client.displayName,
                            language: view.client.language,
                            countryCode: view.client.countryCode || "",
                          },
                        )
                      }
                    >
                      修改资料
                    </button>
                    <button
                      disabled={locked || !active}
                      onClick={() =>
                        open("archiveClient", "存档客户", {
                          clientID: view.client.id,
                          expectedRevision: view.client.revision,
                        })
                      }
                    >
                      存档客户
                    </button>
                  </div>
                  <h3>联系人</h3>
                  <button
                    disabled={locked || !active}
                    onClick={() => open("saveContact", "新增联系人", base())}
                  >
                    新增联系人
                  </button>
                  <ul className="crm-cards">
                    {view.contacts.items.map((c) => (
                      <li key={c.id}>
                        <strong>
                          {c.name}
                          {c.isPrimary ? " · 主联系人" : ""}
                        </strong>
                        <p>
                          {c.email || "未填邮箱"} · {c.phone || "未填电话"}
                        </p>
                        <p>{c.jobTitle}</p>
                        <div className="crm-actions">
                          <button
                            disabled={locked || !active}
                            onClick={() =>
                              open(
                                "saveContact",
                                "修改联系人",
                                { ...base(), contactID: c.id, expectedRevision: c.revision },
                                {
                                  name: c.name,
                                  email: c.email || "",
                                  phone: c.phone || "",
                                  jobTitle: c.jobTitle || "",
                                },
                              )
                            }
                          >
                            修改联系人
                          </button>
                          <button
                            disabled={locked || !active || c.isPrimary}
                            onClick={() =>
                              open("setPrimaryContact", "设为主联系人", {
                                ...base(),
                                contactID: c.id,
                              })
                            }
                          >
                            设为主联系人
                          </button>
                          <button
                            disabled={locked || !active}
                            onClick={() =>
                              open("archiveContact", "存档联系人", {
                                ...base(),
                                contactID: c.id,
                                expectedRevision: c.revision,
                              })
                            }
                          >
                            存档联系人
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <Pager
                    label="联系人"
                    data={view.contacts}
                    disabled={locked || Boolean(draft)}
                    onPage={(n) =>
                      void loadView(view.client.id, {
                        contacts: n,
                        links: view.links.page,
                        candidates: view.candidates.page,
                      })
                    }
                  />
                  <h3>关联咨询</h3>
                  <p>有旧客户访问授权时，撤销会被阻止；请先由有权员工核对。</p>
                  <ul className="crm-cards">
                    {view.links.items.map((l) => (
                      <li key={l.linkID}>
                        <strong>
                          {l.name} · {l.reference}
                        </strong>
                        {l.serviceCase && (
                          <p>
                            <a
                              href={`/business-center?id=${l.serviceCase.id}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              打开服务单：{l.serviceCase.title}
                            </a>
                          </p>
                        )}
                        <button
                          disabled={locked || !active}
                          onClick={() =>
                            open("revokeInquiryLink", "撤销内部关联", {
                              ...base(),
                              linkID: l.linkID,
                              expectedRevision: l.linkRevision,
                            })
                          }
                        >
                          撤销关联
                        </button>
                      </li>
                    ))}
                  </ul>
                  <Pager
                    label="关联咨询"
                    data={view.links}
                    disabled={locked || Boolean(draft)}
                    onPage={(n) =>
                      void loadView(view.client.id, {
                        contacts: view.contacts.page,
                        links: n,
                        candidates: view.candidates.page,
                      })
                    }
                  />
                  <h3>可关联咨询</h3>
                  <ul className="crm-cards">
                    {view.candidates.items.map((c) => (
                      <li key={c.inquiryID}>
                        <strong>
                          {c.name} · {c.reference}
                        </strong>
                        <button
                          disabled={locked || !active}
                          onClick={() =>
                            open("linkInquiry", "关联咨询", {
                              ...base(),
                              inquiryID: c.inquiryID,
                              expectedLinkRevision: c.expectedLinkRevision,
                            })
                          }
                        >
                          关联此咨询
                        </button>
                      </li>
                    ))}
                  </ul>
                  <Pager
                    label="可关联咨询"
                    data={view.candidates}
                    disabled={locked || Boolean(draft)}
                    onPage={(n) =>
                      void loadView(view.client.id, {
                        contacts: view.contacts.page,
                        links: view.links.page,
                        candidates: n,
                      })
                    }
                  />
                </>
              )}
            </section>
          </div>
          {draft && options && (
            <section ref={editRef} className="crm-panel crm-edit" aria-label="操作表单">
              <h2>{draft.title}</h2>
              <p>提交将按打开表单时的版本核对；刷新不会覆盖当前填写。</p>
              <form onSubmit={(e) => void submit(e)}>
                <fieldset disabled={locked}>
                  {draft.action === "createClient" && (
                    <label>
                      客户类型
                      <select
                        value={values("kind")}
                        onChange={(e) => setValue("kind", e.target.value)}
                      >
                        <option value="individual">个人客户</option>
                        <option value="company">企业客户</option>
                      </select>
                    </label>
                  )}
                  {["createClient", "updateClient"].includes(draft.action) && (
                    <>
                      {field("displayName", "客户名称", true)}
                      <label>
                        沟通语言
                        <select
                          value={values("language")}
                          onChange={(e) => setValue("language", e.target.value)}
                        >
                          <option value="en">英文</option>
                          <option value="zh">中文</option>
                        </select>
                      </label>
                      {field("countryCode", "国家／地区代码（可选，如 CN、JP）", false, "text", 2)}
                    </>
                  )}
                  {draft.action === "createClient" && options.role === "admin" && (
                    <label>
                      所属团队
                      <select
                        required
                        value={values("teamID")}
                        onChange={(e) => {
                          setValue("teamID", e.target.value);
                          setValue("ownerID", "");
                        }}
                      >
                        {options.teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {draft.action === "createClient" && options.role !== "operations" && (
                    <label>
                      负责人
                      <select
                        required={options.role === "manager"}
                        value={values("ownerID")}
                        onChange={(e) => setValue("ownerID", e.target.value)}
                      >
                        <option value="">
                          {options.role === "admin" ? "暂不分派" : "请选择负责人"}
                        </option>
                        {options.owners
                          .filter(
                            (s) =>
                              s.teamID ===
                              Number(options.role === "admin" ? values("teamID") : options.teamID),
                          )
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                  {draft.action === "saveContact" && (
                    <>
                      {field("name", "联系人姓名", true)}
                      {field("email", "邮箱", false, "email", 254)}
                      {field("phone", "电话", false, "tel", 100)}
                      {field("jobTitle", "职务（可选）", false, "text", 100)}
                    </>
                  )}
                  {["linkInquiry", "revokeInquiryLink", "archiveClient", "archiveContact"].includes(
                    draft.action,
                  ) && (
                    <label>
                      核对依据或原因（10–2000字）
                      <textarea
                        required
                        minLength={10}
                        maxLength={2000}
                        value={values("reason")}
                        onChange={(e) => setValue("reason", e.target.value)}
                      />
                    </label>
                  )}
                  <button type="submit">确认{draft.title}</button>
                  <button
                    type="button"
                    onClick={() => {
                      if (discard()) setDraft(undefined);
                    }}
                  >
                    取消
                  </button>
                </fieldset>
              </form>
            </section>
          )}
          {pending && (
            <section className="crm-panel" aria-label="原操作核实">
              <p>
                {busy
                  ? "正在等待原操作结果…"
                  : "原操作仍未确认。为避免重复操作，已保留原请求并暂停其他写入。"}
              </p>
              <button disabled={busy} onClick={() => void submit()}>
                重试原操作
              </button>
            </section>
          )}
        </>
      )}
    </main>
  );
}
function Pager({
  label,
  data,
  disabled,
  onPage,
}: {
  label: string;
  data: Page<unknown>;
  disabled: boolean;
  onPage: (page: number) => void;
}) {
  return (
    <nav aria-label={`${label}分页`} className="crm-actions">
      <button disabled={disabled || data.page <= 1} onClick={() => onPage(data.page - 1)}>
        上一页
      </button>
      <span>
        第 {data.page} 页 · {data.total} 项
      </span>
      <button
        disabled={disabled || data.page * data.limit >= data.total}
        onClick={() => onPage(data.page + 1)}
      >
        下一页
      </button>
    </nav>
  );
}
