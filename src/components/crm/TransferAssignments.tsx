import type { RefObject } from "react";
import type { TransferDraft } from "../../lib/crm-transfer-draft";
import { ownerLabel, followUpLabel } from "../../lib/crm-overview-view";
import { Pager } from "./Pager";
export function TransferAssignments({
  draft: d,
  locked,
  paging,
  sectionRef,
  onChange,
  onToggle,
  onPage,
  onReview,
  onSubmit,
  onCancel,
}: {
  draft: TransferDraft;
  locked: boolean;
  paging: boolean;
  sectionRef?: RefObject<HTMLElement | null>;
  onChange: (draft: TransferDraft) => void;
  onToggle: (id: number) => void;
  onPage: (page: number) => void;
  onReview: () => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const patch = (value: Partial<TransferDraft>) => onChange({ ...d, ...value, review: false });
  return (
    <section ref={sectionRef} className="crm-panel crm-edit" aria-label="责任转交表单">
      <h2>同团队责任转交</h2>
      <p>打开时客户第 {d.base.expectedClientRevision} 版。跨页和刷新不会替换已选版本。</p>
      <p>旧客户对外授权保持不变。未选择的咨询不会自动转交；咨询与其派生服务单为一个责任单位。</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (d.review) onSubmit();
          else onReview();
        }}
      >
        <fieldset disabled={locked || paging}>
          <label>
            接收人
            <select
              required
              value={d.recipientID}
              onChange={(e) => patch({ recipientID: e.target.value })}
            >
              <option value="">请选择本团队现职运营</option>
              {d.base.receivers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="crm-check">
            <input
              type="checkbox"
              checked={d.transferClient}
              onChange={(e) => patch({ transferClient: e.target.checked })}
            />
            转交客户主负责人（当前：{ownerLabel(d.base.clientOwner)}）
          </label>
          <h3>逐项选择咨询</h3>
          {!d.current.inquiries.length && <p>当前权限范围内暂无可转交咨询。</p>}
          <ul className="crm-cards">
            {d.current.inquiries.map((q) => (
              <li key={q.inquiryID}>
                <label className="crm-check">
                  <input
                    type="checkbox"
                    checked={d.selected.some((s) => s.inquiryID === q.inquiryID)}
                    onChange={() => onToggle(q.inquiryID)}
                  />
                  {q.reference} · {q.name}
                </label>
                <p>负责人：{ownerLabel(q.ownerDisplay)}</p>
                {q.serviceCase && <p>包含派生服务单：{q.serviceCase.title}</p>}
              </li>
            ))}
          </ul>
          <Pager label="可转交咨询" data={d.current} disabled={locked || paging} onPage={onPage} />
          <h3>本次已选</h3>
          {!d.transferClient && !d.selected.length && <p>尚未选择目标。</p>}
          <p>
            客户主负责人 {d.transferClient ? 1 : 0} 项；咨询 {d.selected.length}{" "}
            项。每次最多20条咨询。
          </p>
          <ul className="crm-cards" aria-label="已选咨询">
            {d.selected.map((q) => (
              <li key={q.inquiryID}>
                <strong>
                  {q.reference} · {q.name}
                </strong>
                <p>原负责人：{ownerLabel(q.ownerDisplay)}</p>
                <small>
                  原版本 {followUpLabel(q.expectedUpdatedAt)} · 服务单版本{" "}
                  {q.expectedCaseRevision ?? "无"}
                </small>
                <button type="button" onClick={() => onToggle(q.inquiryID)}>
                  移除 {q.reference}
                </button>
              </li>
            ))}
          </ul>
          <label>
            转交原因（10–2000字）
            <textarea
              required
              minLength={10}
              maxLength={2000}
              value={d.reason}
              onChange={(e) => patch({ reason: e.target.value })}
            />
          </label>
          <p>只转客户后，接收人可能看不到未转交咨询；旧业务负责人也不会因此得到客户档案权限。</p>
          {d.review && (
            <div className="crm-review" role="status">
              <strong>
                请核对：接收人 {d.base.receivers.find((s) => String(s.id) === d.recipientID)?.name}
              </strong>
              <p>
                上面是选择数量；已同负责人的项目不重写，实际变更数以成功回执为准。回执确认历史提交后仍会重读当前状态。
              </p>
            </div>
          )}
          <div className="crm-actions">
            <button type="submit">{d.review ? "确认提交转交" : "核对转交"}</button>
            {d.review && (
              <button type="button" onClick={() => onChange({ ...d, review: false })}>
                返回修改
              </button>
            )}
            <button type="button" onClick={onCancel}>
              取消转交
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
