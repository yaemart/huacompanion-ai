"use client";
import "./content-center.css";
import { useState } from "react";
import type { SharedFactEditorData } from "@/server/immigration/shared-editor";
import type { SharedFactInput } from "@/server/immigration/shared-facts-service";
import { validateSharedFacts } from "@/lib/policy-shared-facts";
import { sharedPolicyInput } from "@/lib/policy-shared-form";
import { policyIdentity as identity } from "@/lib/immigration-policy-entry";
import { policyStateLabels } from "@/lib/immigration-policy-list";
import type { PolicyForm } from "@/lib/immigration-policy-editor";
import { PolicyFields } from "./PolicyFields";
import { PolicyList } from "./PolicyList";
export function PolicyFactWorkbench({ initial: desk }: { initial: SharedFactEditorData }) {
  const [form, setForm] = useState(desk.policy);
  const [key, setKey] = useState(desk.group?.contentKey || "");
  const [dirty, setDirty] = useState(false);
  const [checked, setChecked] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const { draft, group, permissions: perm } = desk;
  const waiting = draft?.reviewState === "review";
  const editable = perm.canEdit && !waiting;
  const own = [
    draft?.lastEditedBy,
    draft?.submittedBy,
    ...(Array.isArray(draft?.contributors) ? draft.contributors : []),
  ].includes(perm.userId);
  const reviewable = perm.canReview && (!own || (perm.isAdmin && !!reason.trim()));
  const open = (id?: number) =>
    window.location.assign("/content-center/policy-facts" + (id ? `?id=${id}` : ""));
  function change(value: PolicyForm) {
    if (!group && (!key || key === identity(form, "zh")?.contentKey))
      setKey(identity(value, "zh")?.contentKey || "");
    setForm(value);
    setDirty(true);
    setChecked(false);
  }
  async function action(action: SharedFactInput["action"], versionId?: number) {
    setBusy(true);
    setMessage("");
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
          versionId,
          groupId: group?.id,
          revision: draft?.revision,
          contentKey: key,
          facts: action === "save" ? sharedPolicyInput(form) : undefined,
          policyReviewed: checked,
          note: reason,
          overrideReason: reason,
        }),
      });
      const data: { groupId: number; error?: string } = await response.json();
      if (!response.ok) throw Error(data.error || "操作未完成");
      open(data.groupId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作未完成");
      setChecked(false);
      setBusy(false);
    }
  }
  return (
    <main className="content-center">
      <a href="/admin">← 中文管理后台</a>
      <h1>政策共用事实</h1>
      <p>国家、停留、日期、口岸与来源只填一次。发布事实会让两语说明待复核。</p>
      {group &&
        ["zh", "en"].map((locale) => (
          <button
            key={locale}
            disabled={busy || dirty}
            onClick={() =>
              window.location.assign(`/content-center/policy-facts?id=${group.id}&locale=${locale}`)
            }
          >
            {locale === "zh" ? "中文" : "英文"}公开说明
          </button>
        ))}
      <p role="status">{busy ? "处理中…" : message}</p>
      <div className="workspace policy-workspace">
        <aside className="panel">
          <button disabled={busy || dirty || !perm.canEdit} onClick={() => open()}>
            新建政策
          </button>
          <button disabled={busy} onClick={() => open(group?.id)}>
            {dirty ? "放弃修改并重新读取" : "重新读取"}
          </button>
          <PolicyList
            rows={desk.rows}
            today={desk.today}
            selectedId={group?.id}
            disabled={busy || dirty}
            onSelect={open}
          />
        </aside>
        <section className="panel">
          <h2>{identity(form, "zh")?.title || "选择国家和类型后自动生成"}</h2>
          <p>
            {draft ? policyStateLabels[draft.reviewState] : "新草稿"}；
            {group?.activeFactVersion ? "有已发布版本" : "未发布"}
          </p>
          {draft?.reviewNote && <p className="notice">退回／复核说明：{draft.reviewNote}</p>}
          <fieldset disabled={busy || !editable}>
            <PolicyFields
              shared
              value={form}
              onChange={change}
              countries={desk.countries}
              verifiers={desk.verifiers}
            />
            <details>
              <summary>高级：政策内容标识</summary>
              <label>
                内容标识
                <input
                  value={key}
                  readOnly={!!group}
                  onChange={(e) => {
                    setKey(e.target.value);
                    setDirty(true);
                  }}
                />
              </label>
            </details>
          </fieldset>
          {dirty && <p>有未保存修改，请先保存；切换记录暂不可用。</p>}
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
                  disabled={busy || dirty}
                  checked={checked}
                  onChange={(e) => setChecked(e.target.checked)}
                />
                已核实国家、来源、日期和适用条件
              </label>
            </section>
          )}
          {(
            [
              ["save", "保存草稿", editable],
              ["submit", "提交已保存稿审核", editable && !!draft && !dirty],
              ["return", "退回修改", reviewable && waiting && !!reason.trim() && !dirty],
              ["publish", "审核发布共用事实", reviewable && waiting && checked && !dirty],
              ["unpublish", "下架共用事实", reviewable && !!group?.activeFactVersion && !dirty],
            ] as const
          ).map(([name, label, allowed]) => (
            <button key={name} disabled={busy || !allowed} onClick={() => action(name)}>
              {label}
            </button>
          ))}
          <p>历史另存只生成新草稿，仍需重新审核。</p>
          {desk.versions.map((v) => (
            <button
              key={v.id}
              disabled={busy || dirty || !editable}
              onClick={() => action("restore", v.id)}
            >
              另存第 {v.revision} 版为草稿
            </button>
          ))}
        </section>
      </div>
    </main>
  );
}
