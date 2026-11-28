export interface CrmWriteState {
  payload: string;
  unknown: boolean;
}
export function crmOwnerLabel(role: string, ownerID: number | null, name?: string): string {
  return name || (ownerID ? (role === "operations" ? "本人负责" : "负责人当前不可用") : "待分派");
}
export function beginCrmWrite(input: Record<string, unknown>, operationKey: string): CrmWriteState {
  return { payload: JSON.stringify({ ...input, operationKey }), unknown: false };
}
export function settleCrmWrite(
  state: CrmWriteState,
  status: number | undefined,
  receipt: boolean,
): CrmWriteState | undefined {
  if (status === 200 && receipt) return undefined;
  if (state.unknown || status === undefined || status >= 500 || status < 400)
    return { ...state, unknown: true };
  return undefined;
}
