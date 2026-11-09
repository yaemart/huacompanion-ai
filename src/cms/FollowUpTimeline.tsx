"use client";
import { useRef, useState } from "react";
import { useDocumentInfo, useField } from "@payloadcms/ui";
import type { JSONFieldClientComponent } from "payload";
import { followUps } from "../lib/intake-followups";
import { randomClientID } from "../lib/client-id";
import { FollowUpHistory } from "./FollowUpHistory";
export const FollowUpTimeline: JSONFieldClientComponent = ({ path }) => {
  const { value, setValue } = useField({ path, disableFormData: true });
  const { id, collectionSlug } = useDocumentInfo();
  const [body, setBody] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const request = useRef<{ body: string; key: string } | null>(null);
  async function append() {
    setBusy(true);
    setMessage("");
    try {
      if (!request.current || request.current.body !== body)
        request.current = { body, key: randomClientID() };
      const response = await fetch("/api/intake-followups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: collectionSlug, id, body, key: request.current.key }),
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "追加未完成");
      setValue(followUps(result.followUps), true);
      setBody("");
      request.current = null;
      setMessage("跟进已追加保存。");
    } catch (e) {
      setMessage("追加未完成，输入已保留，请重试。" + (e instanceof Error ? e.message : ""));
    } finally {
      setBusy(false);
    }
  }
  let rows;
  try {
    rows = followUps(value);
  } catch {
    return <p role="alert">跟进历史格式异常，请联系管理员；原记录未被覆盖。</p>;
  }
  return (
    <section aria-label="内部跟进时间线" style={{ marginBottom: 24 }}>
      <h3>内部跟进记录（只能追加）</h3>
      <FollowUpHistory rows={rows} />
      <label htmlFor={`${path}-append`}>新增跟进（仅内部可见）</label>
      <textarea
        id={`${path}-append`}
        value={body}
        maxLength={10000}
        disabled={busy}
        onChange={(e) => setBody(e.target.value)}
        style={{ display: "block", width: "100%", minHeight: 100, boxSizing: "border-box" }}
      />
      <p>
        跟进单独保存，自动记录时间和记录人；上方资料修改时间不变。其他修改请用顶部“保存”。已保存记录不能修改或删除。
      </p>
      <button type="button" disabled={busy || !body.trim()} onClick={append}>
        {busy ? "正在追加…" : "追加跟进（立即保存）"}
      </button>
      <p role="status">{message}</p>
    </section>
  );
};
