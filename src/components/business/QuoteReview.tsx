"use client";

import { useState } from "react";
import type { StaffQuote } from "../../server/business/service";
import { relationID } from "../../cms/access";
import { collectionReasons } from "../../lib/quote-lines";
import type { QuoteConfirmations } from "../../server/business/quote-review";

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
  const [confirmed, setConfirmed] = useState<QuoteConfirmations>({
    difference: [],
    collection: [],
  });
  const { state, canReview, isAuthor } = quote.review;
  const draft = quote.status === "draft";
  const legacyDraft = draft && quote.lineFormat !== 2;
  if (!draft && !quote.reviewStatus && !quote.aiTask) return null;
  const approveDisabled = !reason.trim() || (isAuthor && !exception);
  const required = quote.lines.filter(
    (line) => line.lineId && (line.partyDifferenceReason || line.collection),
  );
  const missing = required.some(
    ({ lineId, partyDifferenceReason, collection }) =>
      (partyDifferenceReason && !confirmed.difference.includes(lineId!)) ||
      (collection && !confirmed.collection.includes(lineId!)),
  );
  function confirm(kind: keyof QuoteConfirmations, id: string, checked: boolean) {
    setConfirmed((state) => ({
      ...state,
      [kind]: checked ? [...state[kind], id] : state[kind].filter((item) => item !== id),
    }));
  }
  async function decide(decision: "approved" | "rejected") {
    if (
      await act("review", {
        quote: quote.id,
        quoteUpdatedAt: quote.updatedAt,
        decision,
        reason,
        selfReview: isAuthor && exception,
        ...(decision === "approved" && quote.lineFormat === 2 && { confirmations: confirmed }),
      })
    ) {
      setReason("");
      setException(false);
      setConfirmed({ difference: [], collection: [] });
    }
  }
  return (
    <section aria-label="报价二审">
      <p>
        {quote.aiTask && `AI 来源任务 #${relationID(quote.aiTask)} · `}二审：{labels[state]}
      </p>
      {quote.reviewReason && <p>审核记录：{quote.reviewReason}</p>}
      {legacyDraft && <p>请选择「以新格式另存一版」，补齐主体后送审。</p>}
      {draft && !legacyDraft && state === "unsubmitted" && (
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
      {draft && !legacyDraft && state === "rejected" && (
        <p>请按审核意见在「新建报价版本」中修订并送审。</p>
      )}
      {draft &&
        !legacyDraft &&
        state === "pending" &&
        (canReview ? (
          <fieldset disabled={busy}>
            <legend>报价审核</legend>
            <p>请逐项核对服务范围、费用、资源和取消规则。审核通过后可另行发出。</p>
            {required.map((line) => (
              <fieldset key={line.lineId}>
                <legend>
                  {quote.lines.indexOf(line) + 1}. {line.label}
                </legend>
                {line.partyDifferenceReason && (
                  <label>
                    <input
                      type="checkbox"
                      onChange={(e) => confirm("difference", line.lineId!, e.target.checked)}
                    />
                    已确认本项签约方与收款方的差异及原因
                  </label>
                )}
                {line.collection && (
                  <label>
                    {collectionReasons[line.collection.reason as keyof typeof collectionReasons]} ·
                    <input
                      type="checkbox"
                      onChange={(e) => confirm("collection", line.lineId!, e.target.checked)}
                    />
                    已确认本项由华伴代收，并已与服务商约定转付
                  </label>
                )}
              </fieldset>
            ))}
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
              disabled={approveDisabled || missing}
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
