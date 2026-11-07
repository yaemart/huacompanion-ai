"use client";
import { useState } from "react";
export default function CustomerLink({ inquiryID }: { inquiryID: string | number }) {
  const [email, setEmail] = useState(""),
    [reason, setReason] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(action: string) {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/customer/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, inquiryID, email, reason }),
      });
      const d = await r.json();
      setMessage(r.ok ? (action === "revoke" ? "关联已撤销" : "已关联验证客户") : d.error);
    } catch {
      setMessage("操作未完成，请重试");
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset>
      <legend>核验客户关联</legend>
      <p>仅在客户已完成邮箱验证，并人工核对其咨询身份后关联。相同邮箱不会自动关联历史记录。</p>
      <label>
        客户已验证邮箱
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>
        核验依据或撤销原因
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          minLength={10}
          maxLength={2000}
        />
      </label>
      <button
        type="button"
        disabled={busy || !email || reason.trim().length < 10}
        onClick={() => save("link")}
      >
        确认核验并关联
      </button>
      <button
        type="button"
        disabled={busy || !email || reason.trim().length < 10}
        onClick={() => save("revoke")}
      >
        撤销关联
      </button>
      <p role="status">{message}</p>
    </fieldset>
  );
}
