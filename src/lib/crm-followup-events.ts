/** Event JSON is private storage, not an employee DTO contract. Never copy unknown keys. */
export function followupEventDetails(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>,
    result: Record<string, unknown> = {};
  for (const key of ["body", "reason", "endReason"])
    if (typeof raw[key] === "string" && raw[key].length <= 2000) result[key] = raw[key];
  for (const key of ["continuationTaskID", "previousTaskID"])
    if (typeof raw[key] === "number" && Number.isSafeInteger(raw[key]) && raw[key] > 0)
      result[key] = raw[key];
  if (raw.source === "legacy-import") result.source = raw.source;
  for (const key of ["originalActorKnown", "originalTimeKnown"])
    if (typeof raw[key] === "boolean") result[key] = raw[key];
  for (const key of ["before", "after"]) {
    const v = raw[key];
    if (!v || typeof v !== "object" || Array.isArray(v)) continue;
    const source = v as Record<string, unknown>,
      state: Record<string, unknown> = {};
    if (
      typeof source.revision === "number" &&
      Number.isSafeInteger(source.revision) &&
      source.revision > 0
    )
      state.revision = source.revision;
    if (["pending", "completed", "canceled"].includes(String(source.state)))
      state.state = source.state;
    if (typeof source.dueAt === "string" && Number.isFinite(Date.parse(source.dueAt)))
      state.dueAt = source.dueAt;
    if (
      source.assigneeID === null ||
      (typeof source.assigneeID === "number" &&
        Number.isSafeInteger(source.assigneeID) &&
        source.assigneeID > 0)
    )
      state.assigneeID = source.assigneeID;
    if (typeof source.needsReview === "boolean") state.needsReview = source.needsReview;
    if (Object.keys(state).length) result[key] = state;
  }
  return result;
}
