"use client";
import { staffDate, staffVersion } from "@/lib/staff-display";
import { relationID } from "@/cms/access";
import "./content-center.css";
import { useMemo, useRef, useState } from "react";
import { StaffActionButton } from "@/components/admin/StaffActionButton";
import { policyActionReasons } from "@/lib/staff-action-reasons";
import { useDraftAutosave, useUnsavedDraft } from "@/components/admin/useDraftProtection";
import { mergeSavedDraft, type DraftSaveResult } from "@/lib/editor-draft-autosave";
import { sharedPolicyForm, sharedPolicyInput } from "@/lib/policy-shared-form";
import type { SharedFactEditorData } from "@/server/immigration/shared-editor";
import type { SharedFactInput } from "@/server/immigration/shared-facts-service";
import { validateSharedFacts } from "@/lib/policy-shared-facts";

import { policyIdentity as identity } from "@/lib/immigration-policy-entry";
import { policyStateLabels } from "@/lib/immigration-policy-list";
import type { PolicyForm } from "@/lib/immigration-policy-editor";
import { PolicyFields } from "./PolicyFields";
import { PolicyList } from "./PolicyList";
import { PolicyCsvImport } from "./PolicyCsvImport";
import { readStaffFormResponse, staffFormMessage } from "@/lib/staff-form-feedback";
const fallback = "政策操作未得到确认，请保留当前填写，稍后重试。";
export function PolicyFactWorkbench({ initial: desk }: { initial: SharedFactEditorData }) {
  const [form, setForm] = useState(desk.policy);
  const [key, setKey] = useState(desk.group?.contentKey || "");
  const [savedForm, setSavedForm] = useState(desk.policy);
  const [savedKey, setSavedKey] = useState(key);
  const [groupId, setGroupId] = useState(desk.group?.id);
  const [draft, setDraft] = useState(desk.draft);
  const writing = useRef(false);
  const createUnconfirmed = useRef(false);
  const dirty = form !== savedForm || key !== savedKey;
  const input = useMemo(() => ({ form, key }), [form, key]);
  const { navigateAfterSave } = useUnsavedDraft(dirty);
  const [checked, setChecked] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const { group, permissions: perm } = desk;
  const waiting = draft?.reviewState === "review";
  const editable = perm.canEdit && !waiting;
  const own = [
    draft?.lastEditedBy,
    draft?.submittedBy,
    ...(Array.isArray(draft?.contributors) ? draft.contributors : []),
  ].includes(perm.userId);
  const factUrl = (id?: number) => "/content-center/policy-facts" + (id ? `?id=${id}` : "");
  const open = (id?: number) => {
    if (!writing.current) window.location.assign(factUrl(id));
  };
  function change(value: PolicyForm) {
    if (!groupId && (!key || key === identity(form, "zh")?.contentKey))
      setKey(identity(value, "zh")?.contentKey || "");
    setForm(value);
    setChecked(false);
  }
  async function action(
    action: SharedFactInput["action"],
    versionId?: number,
    automatic = false,
  ): Promise<DraftSaveResult> {
    if (writing.current || (action !== "save" && dirty)) return "blocked";
    const unconfirmed = "首次保存结果未确认。请保留填写内容，并从列表核对是否已建稿后再继续。";
    if (action === "save" && !groupId && createUnconfirmed.current) {
      setMessage(unconfirmed);
      return "blocked";
    }
    const firstSave = action === "save" && !groupId;
    if (firstSave) createUnconfirmed.current = true;
    writing.current = true;
    if (!automatic) setBusy(true);
    setMessage("");
    let retryable = !!groupId;
    try {
      if (action === "submit")
        validateSharedFacts(
          sharedPolicyInput(form),
          desk.today,
          desk.countries.some((c) => c.code === "XY"),
        );
      const response = await fetch("/api/content-center/policy-facts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...(automatic && { autosave: true }),
          versionId,
          groupId,
          revision: draft?.revision,
          contentKey: key,
          facts: action === "save" ? sharedPolicyInput(form) : undefined,
          policyReviewed: checked,
          note: reason,
          overrideReason: reason,
        }),
      });
      retryable = !!groupId && (response.status >= 500 || response.ok);
      if (firstSave && response.status >= 400 && response.status < 500)
        createUnconfirmed.current = false;
      const data = await readStaffFormResponse<{
        groupId: number;
        draft?: NonNullable<typeof draft>;
      }>(response, fallback);
      if (!Number.isSafeInteger(data.groupId) || data.groupId < 1) throw Error(fallback);
      if (automatic) {
        if (!data.draft || !Number.isSafeInteger(data.draft.revision)) throw Error(fallback);
        const next = sharedPolicyForm(data.draft.facts);
        setSavedForm(next);
        setForm((current) => mergeSavedDraft(form, next, current));
        setSavedKey(key);
        setKey(key);
        setDraft(data.draft);
        if (!groupId) {
          setGroupId(data.groupId);
          window.history.replaceState(null, "", factUrl(data.groupId));
        }
      } else {
        navigateAfterSave(factUrl(data.groupId));
      }
      createUnconfirmed.current = false;
      return "saved";
    } catch (error) {
      setMessage(
        firstSave && createUnconfirmed.current ? unconfirmed : staffFormMessage(error, fallback),
      );
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
    fingerprint: input,
    save: () => action("save", undefined, true),
  });
  const saving = busy || autosave.syncing;
  const reasons = policyActionReasons({
    saving,
    canEdit: perm.canEdit,
    canReview: perm.canReview,
    waiting,
    dirty,
    saved: !!draft,
    own,
    isAdmin: perm.isAdmin,
    reason,
    checked,
    published: !!group?.activeFactVersion,
  });
  const publishedId = relationID(group?.activeFactVersion);
  const published = desk.versions.find((version) => version.id === publishedId);
  const rows =
    groupId && draft
      ? [
          ...desk.rows.filter((row) => row.id !== groupId),
          {
            id: groupId,
            title: "中英共用事实",
            locale: "zh" as const,
            reviewState: draft.reviewState,
            country: savedForm.countryNameZh || savedForm.countryCode || null,
            policyType: savedForm.policyType,
            validUntil: savedForm.validUntil ?? null,
            lastVerifiedOn: savedForm.lastVerifiedOn ?? null,
          },
        ]
      : desk.rows;
  return (
    <main className="content-center">
      <a href="/admin">← 中文管理后台</a>
      <h1>政策共用事实</h1>
      <p>国家、停留、日期、口岸与来源只填一次。发布事实会让两语说明待复核。</p>
      {perm.canEdit && <PolicyCsvImport disabled={saving || dirty} />}
      {groupId &&
        ["zh", "en"].map((locale) => (
          <button
            key={locale}
            disabled={saving}
            onClick={() =>
              window.location.assign(`/content-center/policy-facts?id=${groupId}&locale=${locale}`)
            }
          >
            {locale === "zh" ? "中文" : "英文"}公开说明
          </button>
        ))}
      <div className="workspace policy-workspace">
        <aside className="panel">
          <button disabled={saving || !perm.canEdit} onClick={() => open()}>
            新建政策
          </button>
          <button disabled={saving} onClick={() => open(groupId)}>
            {dirty ? "放弃修改并重新读取" : "重新读取"}
          </button>
          <PolicyList
            rows={rows}
            today={desk.today}
            selectedId={groupId}
            disabled={saving}
            onSelect={open}
          />
        </aside>
        <section className="panel">
          <h2>{identity(form, "zh")?.title || "选择国家和类型后自动生成"}</h2>
          <p>
            {draft
              ? `草稿 · ${staffVersion(draft.revision)}${draft.reviewState === "draft" ? "" : ` · ${policyStateLabels[draft.reviewState]}`}`
              : "新草稿"}
          </p>
          {group?.activeFactVersion && (
            <p>
              已发布版本
              {published &&
                ` · ${staffVersion(published.revision)} · ${staffDate(published.createdAt)}`}
            </p>
          )}
          {draft?.reviewNote && <p className="notice">退回／复核说明：{draft.reviewNote}</p>}
          <fieldset disabled={busy || !editable || (!groupId && saving)}>
            <PolicyFields
              shared
              value={form}
              onChange={change}
              countries={desk.countries}
              verifiers={desk.verifiers}
            />
            <details>
              <summary>高级</summary>
              <label>
                政策编号（中英文共用）
                <input
                  value={key}
                  readOnly={!!groupId || saving}
                  onChange={(e) => setKey(e.target.value)}
                />
              </label>
            </details>
          </fieldset>
          {autosave.status && <p role="status">{autosave.status}</p>}
          {waiting && <p>待审核事实已锁定，退回后方可编辑。</p>}
          {perm.canReview && (
            <section aria-label="事实审核">
              <label>
                退回原因／管理员自审例外原因
                <textarea
                  value={reason}
                  disabled={busy}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              {own && <p>本人编辑或提交的事实须由另一人审核；管理员例外须填写原因。</p>}
              <label>
                <input
                  type="checkbox"
                  style={{ width: "auto" }}
                  disabled={saving || dirty}
                  checked={checked}
                  onChange={(e) => setChecked(e.target.checked)}
                />
                已核实国家、来源、日期和适用条件
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
              ["save", "保存草稿"],
              ["submit", "提交草稿审核"],
              ["return", "退回修改"],
              ["publish", "审核发布共用事实"],
              ["unpublish", "下架共用事实"],
            ] as const
          ).map(([name, label]) => (
            <StaffActionButton key={name} reason={reasons[name]} onClick={() => action(name)}>
              {label}
            </StaffActionButton>
          ))}
          <p>历史另存只生成新草稿，仍需重新审核。</p>
          {desk.versions.map((v) => (
            <button
              key={v.id}
              disabled={saving || dirty || !editable}
              onClick={() => action("restore", v.id)}
            >
              另存{staffVersion(v.revision)}为草稿
            </button>
          ))}
          {!!desk.versions.length && group && (
            <p>
              <a href={`/performance-center?source=fact&record=${group.id}`}>登记共用事实纠错</a>
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
