export function inquiryCaseID(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return;
  if (!/^[1-9]\d*$/.test(String(value))) return;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : undefined;
}
export function inquiryCaseTitle(reference: unknown, name: unknown): string {
  const text = [reference, name]
    .filter((v): v is string => typeof v === "string" && !!v.trim())
    .map((v) => v.trim())
    .join(" · ");
  return (text || "咨询服务单").slice(0, 200).replace(/[\uD800-\uDBFF]$/, "");
}
