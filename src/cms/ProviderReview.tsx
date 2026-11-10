"use client";
import { useRef, useState } from "react";
import {
  useAuth,
  useDocumentInfo,
  useField,
  useFormModified,
  useFormProcessing,
} from "@payloadcms/ui";
import type { UIFieldClientComponent } from "payload";
import { isManager } from "./access";
import { randomClientID } from "../lib/client-id";
import { providerReviewLabels, type ProviderReviewStatus } from "../lib/provider-review";
import { ProviderReviewPanel } from "./ProviderReviewPanel";
export const ProviderReview: UIFieldClientComponent = () => {
  const { user } = useAuth(),
    info = useDocumentInfo();
  const status = useField({ path: "status" }),
    published = useField({ path: "publicApproved" }),
    base = useField({ path: "editBase" });
  const dirty = useFormModified(),
    saving = useFormProcessing();
  const [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const retry = useRef<{ signature: string; key: string } | null>(null);
  async function review(next: ProviderReviewStatus) {
    setBusy(true);
    setMessage("");
    const input = {
        id: info.id,
        status: next,
        reason: reason.trim(),
        updatedAt: info.data?.updatedAt,
      },
      signature = JSON.stringify(input);
    if (retry.current?.signature !== signature)
      retry.current = { signature, key: randomClientID() };
    try {
      const response = await fetch("/api/provider-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, key: retry.current.key }),
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "审核未完成");
      status.setValue(result.status, true);
      published.setValue(result.publicApproved, true);
      base.setValue(result.updatedAt, true);
      info.setData({
        ...info.data,
        status: result.status,
        publicApproved: result.publicApproved,
        updatedAt: result.updatedAt,
      });
      info.setLastUpdateTime(Date.parse(result.updatedAt));
      if (!result.duplicate) info.incrementVersionCount();
      retry.current = null;
      setReason("");
      setMessage(`已记录${providerReviewLabels[next]}及审核原因。`);
    } catch (e) {
      setMessage("审核未完成，原因已保留。" + (e instanceof Error ? e.message : "请重试"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <ProviderReviewPanel
      allowed={isManager(user)}
      busy={busy}
      dirty={dirty || saving || !info.id}
      reason={reason}
      message={message}
      onReason={setReason}
      onReview={(next) => void review(next)}
    />
  );
};
