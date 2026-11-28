import type { OverviewPage, QueueItem } from "../../lib/crm-overview";
import { ownerLabel } from "../../lib/crm-overview-view";
import { Pager } from "./Pager";
export function AssignmentQueue({
  target,
  data,
  disabled,
  onTarget,
  onPage,
  onOpenClient,
}: {
  target: "client" | "inquiry";
  data?: OverviewPage<QueueItem>;
  disabled: boolean;
  onTarget: (target: "client" | "inquiry") => void;
  onPage: (page: number) => void;
  onOpenClient: (id: number) => void;
}) {
  return (
    <section className="crm-panel crm-queue" aria-label="待分派队列">
      <h2>待分派</h2>
      <p>只显示当前权限范围内缺少有效负责人的客户及关联咨询；不自动改写原负责人。</p>
      <label>
        待分派类型
        <select
          disabled={disabled}
          value={target}
          onChange={(e) => onTarget(e.target.value as "client" | "inquiry")}
        >
          <option value="client">客户主负责人</option>
          <option value="inquiry">关联咨询负责人</option>
        </select>
      </label>
      <button disabled={disabled} onClick={() => onPage(1)}>
        重新载入队列
      </button>
      {!data ? (
        <p>尚未读取队列，请重新载入。</p>
      ) : (
        <>
          <p>当前范围内共 {data.total} 项</p>
          {!data.items.length && <p>当前权限范围内暂无待分派。</p>}
          <ul className="crm-cards">
            {data.items.map((i) => (
              <li key={`${i.clientID}:${i.inquiryID ?? 0}`}>
                <strong>
                  {i.reference} · {i.name}
                </strong>
                <p>{ownerLabel(i.ownerDisplay)}</p>
                {i.needsReview && <p>需管理员核对归属，不能跨团队转交。</p>}
                <button disabled={disabled} onClick={() => onOpenClient(i.clientID)}>
                  打开客户核对
                </button>
              </li>
            ))}
          </ul>
          <Pager label="待分派" data={data} disabled={disabled} onPage={onPage} />
        </>
      )}
    </section>
  );
}
