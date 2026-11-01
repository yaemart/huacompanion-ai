"use client";
import { useState } from "react";
export default function QuoteReview({
  quote,
  canReview,
  busy,
  act,
}: {
  quote: any;
  canReview: boolean;
  busy: boolean;
  act: (action: string, input: any) => Promise<boolean>;
}) {
  const [reason, setReason] = useState("");
  if (!quote.aiTask) return null;
  return (
    <section>
      <p>
        AI 来源任务 #{typeof quote.aiTask === "object" ? quote.aiTask.id : quote.aiTask} ·
        人工审核：
        {({ pending: "待审核", approved: "已通过", rejected: "已退回" } as any)[
          quote.reviewStatus
        ] || "待审核"}
      </p>
      {quote.reviewReason && <p>审核记录：{quote.reviewReason}</p>}
      {quote.status === "draft" && quote.reviewStatus === "pending" && canReview && (
        <fieldset disabled={busy}>
          <legend>主管审核</legend>
          <p>请逐项核对事实、费用、服务资源和取消规则。此操作只批准草稿，发给客户需另行点击。</p>
          <label>
            审核意见
            <textarea
              required
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button
            disabled={!reason.trim()}
            onClick={() => act("review", { quote: quote.id, decision: "approved", reason })}
          >
            人工审核通过
          </button>
          <button
            disabled={!reason.trim()}
            onClick={() => act("review", { quote: quote.id, decision: "rejected", reason })}
          >
            退回此版本
          </button>
        </fieldset>
      )}
    </section>
  );
}
