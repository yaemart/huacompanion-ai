"use client";

import { useState } from "react";
import type { StaffQuote } from "../../server/business/service";
import { relationID } from "../../cms/access";

const labels = { unsubmitted: "待送审", pending: "待审核", approved: "已通过", rejected: "已退回" };

export default function QuoteReview({
  quote,
  busy,
  act,
}: {
  quote: StaffQuote;
  busy: boolean;
  act: (action: string, input: object) => Promise<boolean>;
}) {
  const [reason, setReason] = useState("");
  const [exception, setException] = useState(false);
  const { state, canReview, isAuthor } = quote.review;
  const draft = quote.status === "draft";
  if (!draft && !quote.reviewStatus && !quote.aiTask) return null;
  const approveDisabled = !reason.trim() || (isAuthor && !exception);
  async function decide(decision: "approved" | "rejected") {
    if (
      await act("review", {
        quote: quote.id,
        quoteUpdatedAt: quote.updatedAt,
        decision,
        reason,
        selfReview: isAuthor && exception,
      })
    ) {
      setReason("");
      setException(false);
    }
  }
  return (
    <section aria-label="报价二审">
      <p>
        {quote.aiTask && `AI 来源任务 #${relationID(quote.aiTask)} · `}二审：{labels[state]}
      </p>
      {quote.reviewReason && <p>审核记录：{quote.reviewReason}</p>}
      {draft && state === "unsubmitted" && (
        <>
          <p>
            {quote.reviewStatus === "approved"
              ? "当前版本需要重新审核。"
              : "送审并通过后可发出此版本。"}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void act("submit-review", { quote: quote.id })}
          >
            {quote.reviewStatus === "approved" ? "重新提交审核" : "提交审核"}
          </button>
        </>
      )}
      {draft && state === "rejected" && <p>请按审核意见在「新建报价版本」中修订并送审。</p>}
      {draft &&
        state === "pending" &&
        (canReview ? (
          <fieldset disabled={busy}>
            <legend>报价审核</legend>
            <p>请逐项核对服务范围、费用、资源和取消规则。审核通过后可另行发出。</p>
            {isAuthor && (
              <label>
                <input
                  type="checkbox"
                  checked={exception}
                  onChange={(event) => setException(event.target.checked)}
                />
                使用管理员自审例外
              </label>
            )}
            <label>
              {isAuthor ? "自审例外原因（必填）" : "审核意见（必填）"}
              <textarea
                maxLength={2000}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={approveDisabled}
              onClick={() => void decide("approved")}
            >
              审核通过
            </button>
            <button
              type="button"
              disabled={approveDisabled}
              onClick={() => void decide("rejected")}
            >
              退回此版本
            </button>
          </fieldset>
        ) : (
          <p>请由另一位有报价审核权限的员工审核。</p>
        ))}
    </section>
  );
}
