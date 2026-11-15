"use client";
import React, { useRef, useState } from "react";
import { useDraftAutosave, useUnsavedDraft } from "@/components/admin/useDraftProtection";
import { mergeSavedDraft, type DraftSaveResult } from "@/lib/editor-draft-autosave";
import type {
  readSharedPolicyNote,
  SharedNoteInput,
} from "@/server/immigration/shared-notes-service";
import { relationID } from "@/cms/access";
import { explanationFactWarning } from "@/lib/policy-shared-notes";
import { policyTypeLabels, policyStateLabels } from "@/lib/immigration-policy-list";
import { readStaffFormResponse, staffFormMessage } from "@/lib/staff-form-feedback";
const fallback = "说明操作未得到确认，请保留当前填写，稍后重试。";
export function PolicyNoteWorkbench({
  initial: desk,
}: {
  initial: Awaited<ReturnType<typeof readSharedPolicyNote>>;
}) {
  const { group, facts, permissions: perm } = desk;
  const [draft, setDraft] = useState(desk.draft);
  const [body, setBody] = useState(draft || desk.defaultBody);
  const [savedBody, setSavedBody] = useState(body);
  const dirty = body !== savedBody;
  const writing = useRef(false);
  const { navigateAfterSave } = useUnsavedDraft(dirty);
  const [checked, setChecked] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const waiting = draft?.reviewState === "review";
  const editable = perm.canEdit && !waiting;
  const own = [
    draft?.lastEditedBy,
    draft?.submittedBy,
    ...(Array.isArray(draft?.contributors) ? draft.contributors : []),
  ].includes(perm.userId);
  const currentBasis =
    relationID(draft?.basedOnFactVersion) === relationID(group.activeFactVersion);
  const ready = !dirty && !!facts && currentBasis;
  const reviewable = perm.canReview && (!own || (perm.isAdmin && !!reason.trim()));
  const noteUrl = (locale?: string) =>
    `/content-center/policy-facts?id=${group.id}${locale ? `&locale=${locale}` : ""}`;
  const open = (locale?: string) => {
    if (!writing.current) window.location.assign(noteUrl(locale));
  };
  function change(name: "title" | "slug" | "publicNotes", value: string) {
    setBody({ ...body, [name]: value });
    setChecked(false);
  }
  async function action(
    action: SharedNoteInput["action"],
    versionId?: number,
    automatic = false,
  ): Promise<DraftSaveResult> {
    if (writing.current || (action !== "save" && dirty)) return "blocked";
    writing.current = true;
    if (!automatic) setBusy(true);
    setMessage("");
    let retryable = !!draft;
    try {
      const response = await fetch("/api/content-center/policy-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...(automatic && { autosave: true }),
          groupId: group.id,
          locale: desk.locale,
          factVersion: relationID(group.activeFactVersion) ?? null,
          revision: draft?.revision,
          body: { title: body.title, slug: body.slug, publicNotes: body.publicNotes || "" },
          versionId,
          noteReviewed: checked,
          note: reason,
          overrideReason: reason,
        }),
      });
      retryable = !!draft && (response.status >= 500 || response.ok);
      const data = await readStaffFormResponse<{ ok: boolean; draft?: NonNullable<typeof draft> }>(
        response,
        fallback,
      );
      if (data.ok !== true) throw Error(fallback);
      if (automatic) {
        const next = data.draft;
        if (!next || !Number.isSafeInteger(next.revision)) throw Error(fallback);
        setSavedBody(next);
        setBody((current) => mergeSavedDraft(body, next, current));
        setDraft(next);
      } else {
        navigateAfterSave(noteUrl(desk.locale));
      }
      return "saved";
    } catch (error) {
      setMessage(staffFormMessage(error, fallback));
      setChecked(false);
      return retryable ? "retry" : "blocked";
    } finally {
      writing.current = false;
      if (!automatic) setBusy(false);
    }
  }
  const autosave = useDraftAutosave({
    editable,
    dirty,
    busy,
    fingerprint: body,
    save: () => action("save", undefined, true),
  });
  const saving = busy || autosave.syncing;
  return (
    <main className="content-center">
      <a href="/admin">← 中文管理后台</a>
      <h1>{desk.locale === "zh" ? "中文" : "英文"}公开说明</h1>
      <button disabled={saving} onClick={() => open()}>
        共用事实
      </button>
      <button disabled={saving} onClick={() => open(desk.locale === "zh" ? "en" : "zh")}>
        切换另一语说明
      </button>
      <button disabled={saving} onClick={() => open(desk.locale)}>
        {dirty ? "放弃修改并重新读取" : "重新读取"}
      </button>
      <div className="workspace policy-workspace">
        <section className="panel" aria-label="当前已发布事实">
          <h2>{facts ? `事实第 ${desk.factRevision} 版（中英文共用，只读）` : "尚无已发布事实"}</h2>
          {facts ? (
            <>
              <p>
                {facts.countryNameZh} / {facts.countryNameEn}（{facts.countryCode}） ·{" "}
                {policyTypeLabels[facts.policyType]} ·{" "}
                {facts.maxStayHours != null
                  ? `${facts.maxStayHours} 小时`
                  : `${facts.maxStayDays} 天`}
              </p>
              <p>
                有效期：{facts.validFrom} 至 {facts.validUntil || "截止日尚未确认"}；核实日：
                {facts.lastVerifiedOn}
              </p>
              <p>{facts.portsAndRegions.join("；")}</p>
              <a href={facts.officialSourceUrl} target="_blank" rel="noreferrer">
                打开官方来源
              </a>
            </>
          ) : (
            <p>可以保存说明草稿；事实发布后才能提交说明审核。</p>
          )}
        </section>
        <section className="panel">
          <p>
            {draft ? policyStateLabels[draft.reviewState] : "新草稿"}；
            {draft?.needsReview !== false
              ? "待复核：请按当前事实重新核对，复核通过前公开页隐藏说明。"
              : "已核实本语说明"}
          </p>
          {draft?.reviewNote && <p className="notice">退回／复核说明：{draft.reviewNote}</p>}
          <fieldset disabled={busy || !editable}>
            <details>
              <summary>高级：标题和网址</summary>
              {(["title", "slug"] as const).map((name) => (
                <label key={name}>
                  {name === "title" ? "标题" : "网址末尾"}
                  <input
                    value={body[name]}
                    readOnly={name === "slug" && desk.versions.length > 0}
                    onChange={(e) => change(name, e.target.value)}
                  />
                </label>
              ))}
            </details>
            <label>
              公开说明
              <textarea
                rows={8}
                value={body.publicNotes || ""}
                onChange={(e) => change("publicNotes", e.target.value)}
              />
            </label>
          </fieldset>
          {explanationFactWarning(body.publicNotes || "") && (
            <p className="notice">{explanationFactWarning(body.publicNotes || "")}</p>
          )}
          {autosave.status && <p role="status">{autosave.status}</p>}
          {waiting && <p>待审核说明已锁定，退回后方可编辑。</p>}
          {!currentBasis && facts && <p>事实已变化，请重新核对并保存草稿，再提交审核。</p>}
          {perm.canReview && (
            <section aria-label="本语说明审核">
              <label>
                退回原因／管理员自审例外原因
                <textarea
                  value={reason}
                  disabled={busy}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              {own && <p>本人编辑或提交的说明须由另一人审核；管理员例外须填写原因。</p>}
              <label>
                <input
                  type="checkbox"
                  style={{ width: "auto" }}
                  checked={checked}
                  disabled={busy || dirty || !facts}
                  onChange={(e) => setChecked(e.target.checked)}
                />
                已按当前事实逐项核对本语说明
              </label>
            </section>
          )}
          {busy && <p role="status">处理中…</p>}
          {message && (
            <p role="alert" className="notice">
              {message}
            </p>
          )}
          {(
            [
              ["save", "保存草稿", editable],
              ["submit", "提交已保存稿审核", editable && !!draft && ready],
              ["return", "退回修改", reviewable && waiting && !!reason.trim() && !dirty],
              ["publish", "审核发布本语说明", reviewable && waiting && checked && ready],
              ["unpublish", "下架本语说明", reviewable && !!draft?.publishedNoteVersion && !dirty],
            ] as const
          ).map(([name, label, allowed]) => (
            <button key={name} disabled={saving || !allowed} onClick={() => action(name)}>
              {label}
            </button>
          ))}
          <p>历史另存只生成新草稿，仍需重新审核。</p>
          {desk.versions.map((v) => (
            <button
              key={v.id}
              disabled={saving || dirty || !editable}
              onClick={() => action("restore", v.id)}
            >
              另存第 {v.revision} 版为草稿
            </button>
          ))}
          {!!desk.versions.length && (
            <p>
              <a href={`/performance-center?source=note&record=${group.id}`}>登记公开说明纠错</a>
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
