"use client";

import { useRef, useState } from "react";
import { staffDateTime } from "@/lib/staff-display";
import {
  continuationRequest,
  type ContinuationReceipt,
} from "@/lib/subscription-campaign-continuation-client";
import { MockTaskRequestError } from "@/lib/subscription-campaign-task-client";

type Props = {
  draft: { campaignKey: string; revision: number };
  initial: ContinuationReceipt | null;
  eligible: boolean;
  disabled: boolean;
  onBusyChange: (value: boolean) => void;
  onBlockedChange: (value: boolean) => void;
};
export function CampaignContinuation({
  draft,
  initial,
  eligible,
  disabled,
  onBusyChange,
  onBlockedChange,
}: Props) {
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [notice, setNotice] = useState("");
  const [recovered, setRecovered] = useState<ContinuationReceipt | null>(null);
  const savedReceipt = initial ?? recovered;
  const pending = useRef(false);
  const navigating = useRef(false);
  function reopen() {
    if (disabled || navigating.current) return;
    pending.current = true;
    navigating.current = true;
    setBusy(true);
    onBusyChange(true);
    window.location.assign(
      "/subscription-campaigns?campaign=" + encodeURIComponent(draft.campaignKey),
    );
  }
  async function run(readOnly = false) {
    if (
      pending.current ||
      disabled ||
      (!readOnly && (!eligible || !confirmed || uncertain || savedReceipt))
    )
      return;
    pending.current = true;
    setBusy(true);
    onBusyChange(true);
    setConfirmed(false);
    setNotice("");
    try {
      const receipt = await continuationRequest(draft, readOnly);
      setUncertain(false);
      onBlockedChange(false);
      if (receipt) {
        if (readOnly) {
          setRecovered(receipt);
          onBlockedChange(true);
        } else reopen();
        return;
      }
      setNotice("尚无本版已保存收据。本次仅查询，未再次提交；核对后可重新勾选确认。");
    } catch (error) {
      const unknown = readOnly || !(error instanceof MockTaskRequestError) || error.uncertain;
      setUncertain(unknown);
      onBlockedChange(unknown);
      setNotice(error instanceof Error ? error.message : "续发结果待核实。");
    } finally {
      if (!navigating.current) {
        pending.current = false;
        setBusy(false);
        onBusyChange(false);
      }
    }
  }
  return (
    <section className="campaign-control" aria-label="本版本地续发" aria-busy={busy}>
      <h2>本版本地续发</h2>
      <p>
        仅为原名单中从未尝试且仍合资格的虚构邮箱任务绑定第 {draft.revision}{" "}
        版；已尝试、已取消和待核对记录保留，不补新人。
      </p>
      <p>
        本操作不发送、不领取或占位；后续准备与尝试仍按原权限、额度、预算、限速、邮件优先及重试规则执行。
      </p>
      {savedReceipt ? (
        <p role="status">
          已保存本版续发范围：{savedReceipt.bound} 项，原第 {savedReceipt.originalRevision}{" "}
          版。时间（北京时间）：{staffDateTime(savedReceipt.continuedAt, true)}
          。此为当时绑定数，执行前仍核资格与确认。
        </p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run();
          }}
        >
          {!eligible && (
            <p>请先保存改版、重新模拟并逐语言确认，恢复未取消的活动；有效领取也会阻止首次续发。</p>
          )}
          <fieldset disabled={disabled || busy || uncertain || !eligible}>
            <legend>明确确认本次范围</legend>
            <label>
              <input
                type="checkbox"
                name="confirmed"
                checked={confirmed}
                required
                onChange={(event) => setConfirmed(event.target.checked)}
              />{" "}
              我确认仅为原名单中从未尝试且仍合资格的本地任务续发。
            </label>
            <button className="button" style={{ minHeight: 44 }} disabled={!confirmed}>
              提交本版续发（不发送）
            </button>
          </fieldset>
        </form>
      )}
      {recovered && (
        <>
          <p>
            收据已只读核实，其他写入暂锁。请点击“重新打开本版活动”后再核对预检说明；本页预检说明尚未同步找回的收据。
            重新打开会核对当前条件，变化时原模拟确认会失效。
          </p>
          <button
            type="button"
            className="button"
            style={{ minHeight: 44 }}
            disabled={disabled || busy}
            onClick={reopen}
          >
            重新打开本版活动
          </button>
        </>
      )}
      {notice && <p role="status">{notice}</p>}
      {uncertain && (
        <>
          <p>结果待核实，其他写入已锁定。当前选择保留，只读核实不会再次续发。</p>
          <button
            type="button"
            className="button"
            style={{ minHeight: 44 }}
            disabled={disabled || busy}
            onClick={() => run(true)}
          >
            只读核实本版续发
          </button>
        </>
      )}
    </section>
  );
}
