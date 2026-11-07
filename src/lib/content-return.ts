/** A dismissed prompt cancels the workflow action; only confirmation submits. */
export function requestContentReturn(
  requestNote: (message: string) => string | null,
  submit: (note: string) => unknown,
) {
  const note = requestNote("退回修改意见");
  if (note !== null) return submit(note || "请修改后重新提交");
}
