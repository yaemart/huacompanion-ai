export type FollowUp = {
  id: string;
  body: string;
  legacy?: boolean;
  at?: string;
  actor?: string;
  actorName?: string;
  key?: string;
};
export function followUps(value: unknown): FollowUp[] {
  if (value == null) return [];
  if (
    !Array.isArray(value) ||
    value.some(
      (r) =>
        !r ||
        typeof r.id !== "string" ||
        typeof r.body !== "string" ||
        (!r.legacy &&
          (!Number.isFinite(Date.parse(r.at)) ||
            typeof r.actor !== "string" ||
            typeof r.actorName !== "string" ||
            typeof r.key !== "string")),
    )
  )
    throw Error("跟进历史格式异常，请联系管理员；原记录未被覆盖");
  return value;
}
export function followupInput(input: unknown): {
  kind: "inquiries" | "providers";
  id: number;
  body: string;
  key: string;
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw Error("请填写跟进内容");
  const v = input as Record<string, unknown>;
  if (
    Object.keys(v).some((k) => !["kind", "id", "body", "key"].includes(k)) ||
    (v.kind !== "inquiries" && v.kind !== "providers") ||
    !["number", "string"].includes(typeof v.id) ||
    !/^[1-9]\d*$/.test(String(v.id)) ||
    !Number.isSafeInteger(Number(v.id)) ||
    Number(v.id) < 1 ||
    typeof v.body !== "string" ||
    !v.body.trim() ||
    v.body.length > 10000 ||
    typeof v.key !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v.key)
  )
    throw Error("请填写1至10000字的跟进，重新打开记录后重试");
  return { kind: v.kind, id: Number(v.id), body: v.body.trim(), key: v.key.toLowerCase() };
}
export function followupLabel(row: FollowUp) {
  return row.legacy
    ? "旧备注（原时间／记录人未记录）"
    : `${new Date(Date.parse(row.at!) + 8 * 3600000).toISOString().slice(0, 16).replace("T", " ")}（北京时间） · ${row.actorName}`;
}
export function followupText(value: unknown, legacy?: string | null) {
  const rows = followUps(value);
  return rows.length
    ? rows.map((r) => `${followupLabel(r)}\n${r.body}`).join("\n\n")
    : legacy || "";
}
