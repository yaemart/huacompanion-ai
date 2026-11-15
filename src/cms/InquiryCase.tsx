"use client";
import { useEffect, useRef, useState } from "react";
import { useDocumentInfo, useFormModified, useFormProcessing } from "@payloadcms/ui";
import type { UIFieldClientComponent } from "payload";
import { inquiryCaseID, inquiryCaseTitle } from "../lib/intake-case";
import { randomClientID } from "../lib/client-id";
import { readStaffFormResponse, staffFormMessage } from "../lib/staff-form-feedback";
import { IntakeCasePanel, type IntakeCasePhase } from "./IntakeCasePanel";
const readFallback = "暂时无法读取服务单，请点击「重新读取服务单」。";
const createFallback =
  "创建结果未确认。名称已保留，请再次点击「转为服务单」，系统会先检查是否已创建。";
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
    [failed, setFailed] = useState(false),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0);
  const retry = useRef<{ signature: string; key: string } | null>(null);
  useEffect(() => {
    if (!id) return;
    let live = true;
    setPhase("loading");
    setMessage("");
    setFailed(false);
    void (async () => {
      try {
        const r = await fetch(`/api/business?inquiry=${id}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
        });
        const j = await readStaffFormResponse<{ case: number | null }>(r, readFallback);
        const found = inquiryCaseID(j.case);
        if (j.case !== null && !found) throw Error();
        if (live) {
          setCaseID(found);
          setPhase("ready");
        }
      } catch (e) {
        if (live) {
          setPhase("error");
          setFailed(true);
          setMessage(staffFormMessage(e, readFallback));
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
    setFailed(false);
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
      const j = await readStaffFormResponse<{ case: number; duplicate?: boolean }>(
        r,
        createFallback,
      );
      const found = inquiryCaseID(j.case);
      if (!found) throw Error();
      setCaseID(found);
      retry.current = null;
      setMessage(j.duplicate ? "已找到原服务单，没有重复创建。" : "服务单已创建，请点击链接打开。");
    } catch (e) {
      setFailed(true);
      setMessage(staffFormMessage(e, createFallback));
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
      failed={failed}
      onTitle={setTitle}
      onCreate={() => void create()}
      onRetry={() => setReload((n) => n + 1)}
    />
  );
}
