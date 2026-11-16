export type DraftSaveResult = "saved" | "blocked" | "retry";

export function scheduleDraftAutosave(save: () => void) {
  const timer = setTimeout(save, 30_000);
  return () => clearTimeout(timer);
}

export function canAutosaveDraft({
  editable,
  dirty,
  busy,
  invalid,
}: {
  editable: boolean;
  dirty: boolean;
  busy: boolean;
  invalid: boolean;
}) {
  return editable && dirty && !busy && !invalid;
}

export function warnBeforeLeavingDraft(
  event: Pick<BeforeUnloadEvent, "preventDefault" | "returnValue">,
  unsaved: boolean,
) {
  if (!unsaved) return;
  event.preventDefault();
  event.returnValue = " ";
}

// Keep changes made after the request started while applying server-normalized saved fields.
export function mergeSavedDraft<T extends object>(sent: T, saved: T, current: T): T {
  if (sent === current) return saved;
  const merged = { ...saved };
  for (const field of Object.keys(current) as (keyof T)[]) {
    if (current[field] !== sent[field]) merged[field] = current[field];
  }
  return merged;
}
