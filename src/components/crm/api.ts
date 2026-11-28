export class ReadError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export async function read<T>(
  action: string,
  extra: Record<string, string | number> = {},
): Promise<T> {
  const query = new URLSearchParams({ action });
  for (const [key, value] of Object.entries(extra)) query.set(key, String(value));
  const r = await fetch(`/api/crm?${query}`, { cache: "no-store" });
  const data = await r.json().catch(() => null);
  if (!r.ok || !data)
    throw new ReadError(
      r.status,
      typeof data?.error === "string" ? data.error : "读取失败，请重试。当前填写不会被覆盖。",
    );
  return data as T;
}
