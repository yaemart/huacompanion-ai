export function recoverMessage(raw: string | null): { key: string; text: string } | null {
  try {
    const v = JSON.parse(raw || "null");
    return v &&
      typeof v.text === "string" &&
      v.text.length <= 4000 &&
      typeof v.key === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.key)
      ? { key: v.key, text: v.text }
      : null;
  } catch {
    return null;
  }
}
