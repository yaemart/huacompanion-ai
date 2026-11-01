import { createHash, timingSafeEqual } from "node:crypto";
export const customerCookie = "hua-customer";
export const customerHash = (token: string) => createHash("sha256").update(token).digest("hex");
export function validCustomerToken(v: unknown): v is string {
  return typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
}
export function customerTokenMatches(raw: unknown, hash: string) {
  return (
    validCustomerToken(raw) &&
    validCustomerToken(hash) &&
    timingSafeEqual(Buffer.from(customerHash(raw), "hex"), Buffer.from(hash, "hex"))
  );
}
export function customerEmail(v: unknown) {
  if (typeof v !== "string" || v.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()))
    throw Error("Invalid email");
  return v.trim().toLowerCase();
}
export function usableChallenge(c: any, now = Date.now()) {
  return !!c && !c.consumedAt && c.attempts < 5 && Date.parse(c.expiresAt) > now;
}

export function usableCustomerSession(session: any, now = Date.now()) {
  return (
    !!session &&
    !session.revokedAt &&
    Number.isFinite(Date.parse(session.expiresAt)) &&
    Date.parse(session.expiresAt) > now
  );
}
