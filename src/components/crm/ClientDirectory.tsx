"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useUnsavedDraft } from "../admin/useDraftProtection";
import { beginCrmWrite, settleCrmWrite, type CrmWriteState } from "../../lib/crm-client";
import {
  newTransferDraft,
  mergeTransferPage,
  toggleTransferInquiry,
  captureTransferDraft,
  confirmedTransfer,
  transferResultLabel,
  type TransferDraft,
  type TransferDraftInput,
} from "../../lib/crm-transfer-draft";
import { ownerLabel, followUpLabel } from "../../lib/crm-overview-view";
import type { ClientRow, OverviewDetail, OverviewPage, QueueItem } from "../../lib/crm-overview";
import type { TransferPreview, AssignmentEvent } from "../../lib/crm-assignments";
import type {
  Contact,
  Link,
  Candidate,
  Page,
  Options,
  View,
  Draft,
  OpenClientAction,
} from "./types";
import { read, ReadError } from "./api";
import { ClientRecords } from "./ClientRecords";
import { ClientActionForm } from "./ClientActionForm";
import { CustomerOverview } from "./CustomerOverview";
import { AssignmentQueue } from "./AssignmentQueue";
import { TransferAssignments } from "./TransferAssignments";
import { clientActionPayload } from "./actions";
import { Pager } from "./Pager";
import "./crm.css";
const emptyValues = { name: "", email: "", phone: "", jobTitle: "", reason: "" };
const initialFilters = { q: "", status: "active", kind: "", owner: "", teamID: "", work: "" };
const firstPages = { contacts: 1, links: 1, candidates: 1, overview: 1, history: 1 };
export default function ClientDirectory() {
  const [options, setOptions] = useState<Options>();
  const [list, setList] = useState<OverviewPage<ClientRow>>();
  const [view, setView] = useState<View>();
  const [pages, setPages] = useState(firstPages);
  const [filters, setFilters] = useState(initialFilters),
    applied = useRef(initialFilters);
  const [draft, setDraft] = useState<Draft>();
  const [transfer, setTransfer] = useState<TransferDraft>();
  const [queue, setQueue] = useState<OverviewPage<QueueItem>>();
  const [queueTarget, setQueueTarget] = useState<"client" | "inquiry">("client"),
    [showQueue, setShowQueue] = useState(false);
  const [message, setMessage] = useState(""),
    [denied, setDenied] = useState(false);
  const [pending, setPending] = useState<CrmWriteState>(),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false);
  const [editorLoading, setEditorLoading] = useState(false),
    [queueLoading, setQueueLoading] = useState(false);
  const writeRef = useRef<CrmWriteState | undefined>(undefined),
    sending = useRef(false);
  const editRef = useRef<HTMLElement>(null),
    detailRef = useRef<HTMLElement>(null);
  const sequence = useRef(0),
    listSequence = useRef(0),
    editorSequence = useRef(0),
    queueSequence = useRef(0);
  const { confirmDiscard } = useUnsavedDraft(
    Boolean(draft) || Boolean(transfer) || Boolean(pending),
  );
  const locked = busy || Boolean(pending) || editorLoading;
  const manager = options?.role === "admin" || options?.role === "manager";
  function failed(error: unknown, resource = false) {
    setMessage(error instanceof Error ? error.message : "读取失败，请重试。");
    if (error instanceof ReadError && [401, 403].includes(error.status)) {
      sequence.current++;
      listSequence.current++;
      editorSequence.current++;
      queueSequence.current++;
      setLoading(false);
      setEditorLoading(false);
      setQueueLoading(false);
      setDenied(true);
      setView(undefined);
      setList(undefined);
      setOptions(undefined);
      setQueue(undefined);
      setDraft(undefined);
      setTransfer(undefined);
    } else if (resource && error instanceof ReadError && error.status === 404) {
      sequence.current++;
      editorSequence.current++;
      setLoading(false);
      setEditorLoading(false);
      setView(undefined);
      setDraft(undefined);
      setTransfer(undefined);
    }
  }
  useEffect(() => {
    let active = true;
    const seq = ++listSequence.current;
    Promise.all([read<Options>("options"), read<OverviewPage<ClientRow>>("overviewList")])
      .then(([o, l]) => {
        if (active && seq === listSequence.current) {
          setOptions(o);
          setList(l);
        }
      })
      .catch((e) => {
        if (active && seq === listSequence.current) failed(e);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    editRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    editRef.current
      ?.querySelector<HTMLElement>("input,select,textarea,button")
      ?.focus({ preventScroll: true });
  }, [draft?.action, draft?.base, transfer?.base]);
  const openedID = view?.client.id;
  useEffect(() => {
    if (openedID) {
      detailRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      detailRef.current?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    }
  }, [openedID]);
  async function loadList(page = 1, next = applied.current) {
    const seq = ++listSequence.current;
    const query = Object.fromEntries(Object.entries(next).filter(([, value]) => value !== ""));
    try {
      const [o, l] = await Promise.all([
        read<Options>("options"),
        read<OverviewPage<ClientRow>>("overviewList", { ...query, page }),
      ]);
      if (seq === listSequence.current) {
        applied.current = { ...next };
        setOptions(o);
        setList(l);
      }
    } catch (e) {
      if (seq === listSequence.current) failed(e);
    }
  }
  async function loadView(id: number, next: Partial<typeof firstPages> = {}) {
    const seq = ++sequence.current,
      requested = { ...(view?.client.id === id ? pages : firstPages), ...next };
    setLoading(true);
    setView(undefined);
    try {
      const [overview, contacts, links, candidates, history] = await Promise.all([
        read<OverviewDetail>("overview", { clientID: id, page: requested.overview, limit: 5 }),
        read<Page<Contact>>("contacts", { clientID: id, page: requested.contacts }),
        read<Page<Link>>("linkedInquiries", { clientID: id, page: requested.links }),
        read<Page<Candidate>>("inquiryCandidates", { clientID: id, page: requested.candidates }),
        manager
          ? read<OverviewPage<AssignmentEvent>>("assignmentHistory", {
              clientID: id,
              page: requested.history,
            })
          : Promise.resolve(undefined),
      ]);
      if (seq === sequence.current) {
        setView({ client: overview.client, overview, contacts, links, candidates, history });
        setPages(requested);
      }
    } catch (e) {
      if (seq === sequence.current) failed(e, true);
    } finally {
      if (seq === sequence.current) setLoading(false);
    }
  }
  function discard() {
    if (locked || sending.current || writeRef.current || !confirmDiscard()) return false;
    editorSequence.current++;
    setDraft(undefined);
    setTransfer(undefined);
    return true;
  }
  const open: OpenClientAction = (action, title, base, values = {}) => {
    if (!discard()) return;
    setMessage("");
    setDraft({ action, title, base, values: { ...emptyValues, ...values } });
  };
  async function openTransfer() {
    if (!view || !discard()) return;
    const id = view.client.id,
      seq = ++editorSequence.current;
    setEditorLoading(true);
    setMessage("");
    try {
      const preview = await read<TransferPreview>("transferPreview", { clientID: id });
      if (seq === editorSequence.current) setTransfer(newTransferDraft(preview));
    } catch (e) {
      if (seq === editorSequence.current) failed(e, true);
    } finally {
      if (seq === editorSequence.current) setEditorLoading(false);
    }
  }
  async function transferPage(page: number) {
    if (!transfer || locked) return;
    const snapshot = transfer,
      seq = ++editorSequence.current;
    setEditorLoading(true);
    try {
      const data = await read<TransferPreview>("transferPreview", {
        clientID: snapshot.base.clientID,
        page,
      });
      const merged = mergeTransferPage(snapshot, data);
      if (seq === editorSequence.current)
        setTransfer((current) =>
          current?.base === snapshot.base ? { ...current, current: merged.current } : current,
        );
    } catch (e) {
      if (seq === editorSequence.current) failed(e, true);
    } finally {
      if (seq === editorSequence.current) setEditorLoading(false);
    }
  }
  async function loadQueue(target = queueTarget, page = 1) {
    const seq = ++queueSequence.current;
    setQueueTarget(target);
    setQueue(undefined);
    setQueueLoading(true);
    try {
      const data = await read<OverviewPage<QueueItem>>("assignmentQueue", { target, page });
      if (seq === queueSequence.current) setQueue(data);
    } catch (e) {
      if (seq === queueSequence.current) failed(e);
    } finally {
      if (seq === queueSequence.current) setQueueLoading(false);
    }
  }
  function reviewTransfer() {
    if (!transfer) return;
    try {
      captureTransferDraft(transfer, Number(transfer.recipientID), transfer.reason);
      setTransfer({ ...transfer, review: true });
      setMessage("");
    } catch (e) {
      failed(e);
    }
  }
  async function submit(event?: FormEvent, supplied?: TransferDraftInput) {
    event?.preventDefault();
    if (sending.current || (!draft && !supplied && !writeRef.current) || !options) return;
    if (
      !writeRef.current &&
      !supplied &&
      draft?.action === "saveContact" &&
      !draft.values.email &&
      !draft.values.phone
    ) {
      setMessage("至少填写邮箱或电话。");
      return;
    }
    const operation =
      writeRef.current ??
      beginCrmWrite(supplied ?? clientActionPayload(draft!, options), crypto.randomUUID());
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
      const data = await response.json().catch(() => null),
        original = JSON.parse(operation.payload);
      const confirmed =
        response.ok &&
        (original.action === "transferAssignments"
          ? confirmedTransfer(data, original)
          : Number.isSafeInteger(data?.clientID) &&
            data.clientID > 0 &&
            Number.isSafeInteger(data?.revision) &&
            data.revision > 0 &&
            (original.action === "createClient" || data.clientID === original.clientID));
      const next = settleCrmWrite(operation, code, confirmed);
      writeRef.current = next;
      setPending(next);
      if (confirmed) {
        setDraft(undefined);
        setTransfer(undefined);
        setMessage(
          original.action === "transferAssignments"
            ? transferResultLabel(data) + " 回执已确认，以下为重读的当前资料。"
            : "操作已确认。以下为重新读取的资料。",
        );
        await Promise.all([loadList(list?.page ?? 1), loadView(data.clientID, firstPages)]);
        if (showQueue) await loadQueue();
      } else if ([401, 403].includes(code))
        failed(new ReadError(code, "员工登录或权限已变化，请重新登录核对。"));
      else {
        if (code === 404)
          failed(
            new ReadError(code, "客户或所选咨询已不可用，已隐藏原资料；请由有权员工核对原操作。"),
            true,
          );
        else
          setMessage(
            `${typeof data?.error === "string" ? data.error : "未收到有效操作回执。"}${next ? " 原操作仍未确认，请重试原操作；不要新建或离开本页。" : " 当前输入已保留；请先复制原因，取消表单、刷新后重新打开核对版本。"}`,
          );
        if (!next) setTransfer((d) => (d ? { ...d, review: false } : d));
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
  function submitTransfer() {
    if (!transfer || locked) return;
    try {
      void submit(
        undefined,
        captureTransferDraft(transfer, Number(transfer.recipientID), transfer.reason),
      );
    } catch (e) {
      failed(e);
    }
  }
  const editing = Boolean(draft) || Boolean(transfer),
    filter = (key: keyof typeof initialFilters, value: string) =>
      setFilters((f) => ({ ...f, [key]: value }));
  return (
    <main className="crm-center">
      <header>
        <p className="crm-eyebrow">华伴 · 员工工作台</p>
        <h1>客户总览</h1>
        <p>管理客户档案与咨询归属。只聚合当前有权业务；内部转交不改变旧客户对外授权。</p>
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
            <button disabled={locked} onClick={() => void loadList(list?.page ?? 1)}>
              重新载入列表
            </button>
            {manager && (
              <button
                disabled={locked || queueLoading}
                onClick={() => {
                  if (discard()) {
                    setShowQueue(!showQueue);
                    if (!showQueue) void loadQueue();
                  }
                }}
              >
                {showQueue ? "收起待分派" : "待分派"}
              </button>
            )}
          </div>
          {manager && showQueue && (
            <>
              <AssignmentQueue
                target={queueTarget}
                data={queue}
                disabled={locked || queueLoading}
                onTarget={(target) => {
                  if (discard()) void loadQueue(target);
                }}
                onPage={(page) => {
                  if (discard()) void loadQueue(queueTarget, page);
                }}
                onOpenClient={(id) => {
                  if (discard()) {
                    setShowQueue(false);
                    void loadView(id);
                  }
                }}
              />
              {queueLoading && <p role="status">正在读取待分派…</p>}
            </>
          )}
          <div className="crm-layout">
            <section aria-label="客户列表" className="crm-panel">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (discard()) void loadList(1, filters);
                }}
              >
                <fieldset disabled={locked}>
                  <label>
                    搜索客户
                    <input
                      maxLength={100}
                      value={filters.q}
                      onChange={(e) => filter("q", e.target.value)}
                    />
                  </label>
                  <label>
                    档案状态
                    <select
                      value={filters.status}
                      onChange={(e) => filter("status", e.target.value)}
                    >
                      <option value="active">使用中</option>
                      <option value="archived">已存档</option>
                    </select>
                  </label>
                  <label>
                    客户类型筛选
                    <select value={filters.kind} onChange={(e) => filter("kind", e.target.value)}>
                      <option value="">全部类型</option>
                      <option value="individual">个人客户</option>
                      <option value="company">企业客户</option>
                    </select>
                  </label>
                  <label>
                    主负责人范围
                    <select value={filters.owner} onChange={(e) => filter("owner", e.target.value)}>
                      <option value="">当前授权范围</option>
                      <option value="mine">本人负责</option>
                      {manager && <option value="unassigned">待分派</option>}
                    </select>
                  </label>
                  {options?.role === "admin" && (
                    <label>
                      团队筛选
                      <select
                        value={filters.teamID}
                        onChange={(e) => filter("teamID", e.target.value)}
                      >
                        <option value="">全部授权团队</option>
                        {options.teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label>
                    可见业务筛选
                    <select value={filters.work} onChange={(e) => filter("work", e.target.value)}>
                      <option value="">全部</option>
                      <option value="active">进行中业务</option>
                      <option value="dueToday">今日到期（北京时间）</option>
                      <option value="overdue">已逾期</option>
                    </select>
                  </label>
                  <button>查询</button>
                </fieldset>
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
                        <p>{ownerLabel(c.ownerDisplay)}</p>
                        <small>
                          可见进行中咨询 {c.visibleInquiryCount} · 服务单 {c.visibleCaseCount}
                        </small>
                        <small>最早现有跟进：{followUpLabel(c.nextFollowUp)}</small>
                      </li>
                    ))}
                  </ul>
                  {!list.items.length && <p>当前条件下没有可见客户。</p>}
                  <Pager
                    label="客户"
                    data={list}
                    disabled={locked || editing}
                    onPage={(page) => void loadList(page)}
                  />
                </>
              )}
            </section>
            <section
              ref={detailRef}
              className="crm-panel"
              aria-label="客户详情"
              aria-busy={loading}
            >
              {loading && <p>正在读取客户资料…</p>}
              {!loading && !view && <p>从客户列表或待分派打开客户，或新建客户档案。</p>}
              {view && (
                <>
                  {manager && view.client.status === "active" && (
                    <button disabled={locked} onClick={() => void openTransfer()}>
                      转交责任
                    </button>
                  )}
                  <CustomerOverview
                    data={view.overview}
                    history={view.history}
                    disabled={locked || editing}
                    onPage={(page) => void loadView(view.client.id, { overview: page })}
                    onHistoryPage={(page) => void loadView(view.client.id, { history: page })}
                  />

                  <details>
                    <summary>管理联系人与咨询关联（原档案操作）</summary>
                    <ClientRecords
                      view={view}
                      locked={locked}
                      editing={editing}
                      onOpen={open}
                      onRefresh={() => void loadView(view.client.id)}
                      onPage={(next) => void loadView(view.client.id, next)}
                    />
                  </details>
                </>
              )}
            </section>
          </div>
          {draft && options && (
            <ClientActionForm
              draft={draft}
              options={options}
              locked={locked}
              sectionRef={editRef}
              onChange={(key, value) =>
                setDraft((d) => (d ? { ...d, values: { ...d.values, [key]: value } } : d))
              }
              onSubmit={(e) => void submit(e)}
              onCancel={() => {
                discard();
              }}
            />
          )}
          {transfer && (
            <TransferAssignments
              draft={transfer}
              locked={locked}
              paging={editorLoading}
              sectionRef={editRef}
              onChange={setTransfer}
              onToggle={(id) => {
                try {
                  setTransfer(toggleTransferInquiry(transfer, id));
                } catch (e) {
                  failed(e);
                }
              }}
              onPage={(page) => void transferPage(page)}
              onReview={reviewTransfer}
              onSubmit={submitTransfer}
              onCancel={() => {
                discard();
              }}
            />
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
