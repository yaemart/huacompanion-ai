"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  canAutosaveDraft,
  scheduleDraftAutosave,
  warnBeforeLeavingDraft,
  type DraftSaveResult,
} from "@/lib/editor-draft-autosave";

export function useUnsavedDraft(unsaved: boolean) {
  const allowUnload = useRef(false);

  useEffect(() => {
    if (!unsaved) return;
    const beforeUnload = (event: BeforeUnloadEvent) =>
      warnBeforeLeavingDraft(event, !allowUnload.current);
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [unsaved]);

  return {
    confirmDiscard: () => !unsaved || window.confirm("还有未保存的修改。确定放弃修改并离开吗？"),
    navigateAfterSave: (url: string) => {
      allowUnload.current = true;
      window.location.assign(url);
    },
  };
}

export function useDraftAutosave({
  editable,
  dirty,
  busy,
  fingerprint,
  session = 0,
  save,
}: {
  editable: boolean;
  dirty: boolean;
  busy: boolean;
  fingerprint: object;
  session?: number;
  save: () => Promise<DraftSaveResult>;
}) {
  const [failed, setFailed] = useState<{ fingerprint: object; retry: boolean }>();
  const [syncing, setSyncing] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [savedSession, setSavedSession] = useState<number>();
  const currentFailure = failed?.fingerprint === fingerprint ? failed : undefined;
  const eligible = canAutosaveDraft({
    editable,
    dirty,
    busy: busy || syncing,
    invalid: currentFailure?.retry === false,
  });
  const saveLatest = useEffectEvent(async () => {
    if (!eligible) return;
    setSyncing(true);
    try {
      const result = await save();
      if (result === "saved") {
        setSavedSession(session);
        setFailed(undefined);
      } else {
        setFailed({ fingerprint, retry: result === "retry" });
      }
    } finally {
      setSyncing(false);
      // An immediate failure can batch both syncing updates in the same render.
      setAttempts((count) => count + 1);
    }
  });

  useEffect(() => {
    if (eligible) return scheduleDraftAutosave(() => void saveLatest());
  }, [eligible, attempts]);

  const status = syncing
    ? "正在自动保存草稿…"
    : dirty
      ? currentFailure?.retry
        ? "自动保存暂未成功，当前填写已保留。30 秒后重试。"
        : currentFailure
          ? "自动保存未成功，当前填写已保留。请查看保存提示。"
          : "有未保存修改，每 30 秒自动尝试保存草稿。"
      : savedSession === session
        ? "草稿已自动保存。"
        : "";
  return { syncing, status };
}
