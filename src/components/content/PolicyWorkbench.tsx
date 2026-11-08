"use client";
import "./content-center.css";
import { useEffect, useState } from "react";
import type { ContentBody } from "@/lib/content-model";
import type { PolicyEditorData } from "@/server/immigration/editor";
import { policyForm, policyFormInput } from "@/lib/immigration-policy-editor";
import { PolicyFields } from "./PolicyFields";
import { PolicyList } from "./PolicyList";
const blank = (): ContentBody => ({
  kind: "immigration-policy",
  locale: "en",
  contentKey: "",
  slug: "",
  title: "",
  blocks: [],
  sources: [],
});
async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw Error(data.error || "操作未完成");
  return data;
}
export function PolicyWorkbench() {
  const [desk, setDesk] = useState<PolicyEditorData | null>(null),
    [body, setBody] = useState(blank);
  const [policy, setPolicy] = useState(policyForm),
    [dirty, setDirty] = useState(false),
    [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(true),
    [message, setMessage] = useState(""),
    [reason, setReason] = useState("");
  const [versions, setVersions] = useState<
    { id: number; revision?: number | null; updatedAt: string }[]
  >([]);
  const draft = desk?.draft,
    permissions = desk?.permissions;
  const selfReview =
    !!draft &&
    [
      ...(Array.isArray(draft.contributors) ? draft.contributors : []),
      draft.lastEditedBy,
      draft.submittedBy,
    ].some((id) => id != null && String(id) === String(permissions?.userId));
  const waiting = draft?.reviewState === "review";
  const editable = !!permissions?.canEdit && !waiting;
  const reviewable =
    !!permissions?.canReview && (!selfReview || (permissions.isAdmin && !!reason.trim()));
  function apply(data: PolicyEditorData) {
    setDesk(data);
    setBody((data.draft?.body as unknown as ContentBody) || blank());
    setPolicy(data.policy);
    setDirty(false);
    setReviewed(false);
    setReason("");
    setVersions([]);
  }
  const read = (id?: number, signal?: AbortSignal) =>
    json<PolicyEditorData>("/api/content-center/policy" + (id ? `?id=${id}` : ""), { signal });
  useEffect(() => {
    const controller = new AbortController();
    read(undefined, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) apply(data);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setMessage(String(error.message));
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, []);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await work();
    } catch (error) {
      setReviewed(false);
      setMessage(error instanceof Error ? error.message : "操作未完成");
    } finally {
      setBusy(false);
    }
  }
  function field<K extends "title" | "contentKey" | "slug" | "locale">(
    key: K,
    value: ContentBody[K],
  ) {
    setBody({ ...body, [key]: value });
    setDirty(true);
    setReviewed(false);
  }
  async function action(action: string, extra: object = {}) {
    await run(async () => {
      const saved = await json<{ id: number }>("/api/content-center", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          id: draft?.id,
          revision: draft?.revision,
          ...(action === "save" ? { body, policy: policyFormInput(policy) } : {}),
          policyReviewed: reviewed,
          overrideReason: reason,
          ...extra,
        }),
      });
      apply(await read(saved.id));
      setMessage(
        action === "publish"
          ? "已保存审核快照；公开工具尚未开放"
          : action === "unpublish"
            ? "已下架正式快照"
            : "已保存工作稿；修改不影响现有正式快照",
      );
    });
  }
  async function history() {
    await run(async () => {
      const data = await json<{ versions: typeof versions }>(
        `/api/content-center?versions=${draft!.id}`,
      );
      setVersions(data.versions);
    });
  }
  return (
    <main className="content-center">
      <a href="/admin">← 中文管理后台</a>
      <h1>入境政策工作台</h1>
      <p>人工核实后提交审核。此处管理工作稿与审核快照，公开查询工具尚未开放。</p>
      <p role="status">{message || (busy ? "正在读取…" : "")}</p>
      <div className="workspace policy-workspace">
        <aside className="panel">
          <button
            disabled={busy || dirty || !permissions?.canEdit}
            onClick={() => run(async () => apply(await read()))}
          >
            新建政策
          </button>
          <button disabled={busy} onClick={() => run(async () => apply(await read(draft?.id)))}>
            {dirty ? "放弃未保存修改，重新读取" : "重新读取已保存稿"}
          </button>
          {desk && (
            <PolicyList
              rows={desk.policyRows}
              today={desk.today}
              selectedId={draft?.id}
              disabled={busy || dirty}
              onSelect={(id) => run(async () => apply(await read(id)))}
            />
          )}
        </aside>
        <section className="panel">
          <fieldset disabled={busy || !editable} style={{ border: 0, padding: 0 }}>
            {(["title", "contentKey", "slug"] as const).map((key, i) => (
              <label key={key}>
                {["标题", "内容标识（各语言共用）", "网址标识"][i]}
                <input
                  value={body[key]}
                  disabled={key !== "title" && !!draft}
                  onChange={(e) => field(key, e.target.value)}
                />
              </label>
            ))}
            <label>
              语言
              <select
                disabled={!!draft}
                value={body.locale}
                onChange={(e) => field("locale", e.target.value as ContentBody["locale"])}
              >
                <option value="en">English</option>
                <option value="zh">中文</option>
              </select>
            </label>
            <PolicyFields
              value={policy}
              verifiers={desk?.verifiers || []}
              onChange={(value) => {
                setPolicy(value);
                setDirty(true);
                setReviewed(false);
              }}
            />
          </fieldset>
          {waiting && <p>待审核内容已锁定，须先退回才能修改。</p>}
          {dirty && <p role="status">有未保存修改，请先保存，再提交或审核。</p>}
          <button disabled={busy || !editable} onClick={() => action("save")}>
            保存政策工作稿
          </button>
          <button disabled={busy || !editable || !draft || dirty} onClick={() => action("submit")}>
            提交已保存稿审核
          </button>
          {draft && permissions?.canReview && (
            <section aria-label="审核与发布">
              <h2>审核与发布</h2>
              <label>
                <input
                  type="checkbox"
                  style={{ width: "auto" }}
                  checked={reviewed}
                  disabled={busy || dirty}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                我已人工核实国家代码、官方来源、日期及适用条件
              </label>
              {selfReview &&
                (permissions.isAdmin ? (
                  <label>
                    管理员自审例外原因
                    <textarea value={reason} onChange={(e) => setReason(e.target.value)} />
                  </label>
                ) : (
                  <p>本人编辑或提交的内容，请交由另一位审核员。</p>
                ))}
              {(
                [
                  ["publish", "审核并保存正式快照", waiting && reviewed],
                  ["return", "退回修改", waiting],
                  ["unpublish", "下架正式快照", draft.everPublished],
                ] as const
              ).map(([actionName, label, allowed]) => (
                <button
                  key={actionName}
                  disabled={busy || dirty || !reviewable || !allowed}
                  onClick={() => action(actionName)}
                >
                  {label}
                </button>
              ))}
            </section>
          )}
          {draft && (
            <section>
              <a href={`/content-preview/${draft.id}`} target="_blank" rel="noreferrer">
                预览已保存工作稿（尚未公开）
              </a>
              <button disabled={busy} onClick={history}>
                查看历史版本
              </button>
              {versions.map((version) => (
                <p key={version.id}>
                  工作稿修订{version.revision} · {version.updatedAt}
                  <button
                    disabled={busy || dirty || !editable}
                    onClick={() => action("restore", { versionId: version.id })}
                  >
                    恢复为新工作稿
                  </button>
                </p>
              ))}
            </section>
          )}
        </section>
      </div>
    </main>
  );
}
