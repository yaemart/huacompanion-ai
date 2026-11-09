"use client";
import { useEffect, useRef, useState } from "react";
import { useDocumentInfo, useFormModified, useFormProcessing } from "@payloadcms/ui";
import type { UIFieldClientComponent } from "payload";
import { inquiryCaseID, inquiryCaseTitle } from "../lib/intake-case";
import { randomClientID } from "../lib/client-id";
import { IntakeCasePanel, type IntakeCasePhase } from "./IntakeCasePanel";
export const InquiryCase: UIFieldClientComponent = () => {
  const { id, data } = useDocumentInfo();
  const dirty = useFormModified(),
    saving = useFormProcessing();
  return (
    <CaseEditor
      key={String(id)}
      id={inquiryCaseID(id)}
      defaultTitle={inquiryCaseTitle(data?.reference, data?.name)}
      dirty={dirty || saving}
    />
  );
};
function CaseEditor({
  id,
  defaultTitle,
  dirty,
}: {
  id?: number;
  defaultTitle: string;
  dirty: boolean;
}) {
  const [title, setTitle] = useState(defaultTitle),
    [caseID, setCaseID] = useState<number>(),
    [phase, setPhase] = useState<IntakeCasePhase>(id ? "loading" : "unsaved"),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0);
  const retry = useRef<{ signature: string; key: string } | null>(null);
  useEffect(() => {
    if (!id) return;
    let live = true;
    setPhase("loading");
    setMessage("");
    void (async () => {
      try {
        const r = await fetch(`/api/business?inquiry=${id}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
        });
        const j = await r.json();
        if (!r.ok) throw Error(j.error || "读取失败");
        const found = inquiryCaseID(j.case);
        if (j.case !== null && !found) throw Error("服务单编号无效");
        if (live) {
          setCaseID(found);
          setPhase("ready");
        }
      } catch (e) {
        if (live) {
          setPhase("error");
          setMessage("读取未完成，请重试。" + (e instanceof Error ? e.message : ""));
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [id, reload]);
  async function create() {
    setBusy(true);
    setMessage("");
    const input = { action: "create", inquiry: id, title: title.trim() },
      signature = JSON.stringify(input);
    if (retry.current?.signature !== signature)
      retry.current = { signature, key: randomClientID() };
    try {
      const r = await fetch("/api/business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, key: retry.current.key }),
        signal: AbortSignal.timeout(15000),
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error || "创建未完成");
      const found = inquiryCaseID(j.case);
      if (!found) throw Error("服务单编号无效，请重新读取");
      setCaseID(found);
      retry.current = null;
      setMessage(j.duplicate ? "已找到原服务单，没有重复创建。" : "服务单已创建，请点击链接打开。");
    } catch (e) {
      setMessage(
        "创建未完成，当前输入已保留，可安全重试。" + (e instanceof Error ? e.message : ""),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <IntakeCasePanel
      title={title}
      caseID={caseID}
      busy={busy}
      dirty={dirty}
      phase={phase}
      message={message}
      onTitle={setTitle}
      onCreate={() => void create()}
      onRetry={() => setReload((n) => n + 1)}
    />
  );
}
