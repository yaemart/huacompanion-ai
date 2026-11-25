import { createHmac, timingSafeEqual } from "node:crypto";
import { customerEmail } from "./customer.ts";
const invalid = () => new Error("Invalid campaign feedback");
export function verifyFeedbackSignature(
  body: Buffer,
  headers: Headers,
  secret: string,
  now = Date.now(),
) {
  const id = headers.get("svix-id") ?? "",
    timestamp = headers.get("svix-timestamp") ?? "",
    signatures = headers.get("svix-signature") ?? "";
  if (
    !/^[A-Za-z0-9_-]{1,128}$/.test(id) ||
    !/^\d{10,12}$/.test(timestamp) ||
    Math.abs(Number(timestamp) * 1000 - now) > 300000 ||
    signatures.length > 2048 ||
    !/^whsec_[A-Za-z0-9+/]+={0,2}$/.test(secret)
  )
    throw invalid();
  const key = Buffer.from(secret.slice(6), "base64");
  if (key.length < 16 || key.length > 128) throw invalid();
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.`).update(body).digest();
  const valid = signatures.split(" ").some((part) => {
    if (!/^v1,[A-Za-z0-9+/]{43}=$/.test(part)) return false;
    const actual = Buffer.from(part.slice(3), "base64");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
  if (!valid) throw invalid();
  return id;
}
export function parseFeedbackEvent(body: Buffer) {
  const event = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  const types = [
    "email.delivered",
    "email.bounced",
    "email.complained",
    "email.suppressed",
    "suppression.added",
  ];
  if (!event || typeof event !== "object" || Array.isArray(event) || typeof event.type !== "string")
    throw invalid();
  if (!types.includes(event.type)) return null;
  const data = event.data;
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    typeof event.created_at !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.test(
      event.created_at,
    ) ||
    !Number.isFinite(Date.parse(event.created_at))
  )
    throw invalid();
  if (
    event.type === "email.bounced" &&
    ["Temporary", "Transient", "Undetermined"].includes(data.bounce?.type)
  )
    return null;
  if (event.type === "email.bounced" && data.bounce?.type !== "Permanent") throw invalid();
  const address = event.type === "suppression.added";
  if (!address && (!Array.isArray(data.to) || data.to.length !== 1)) throw invalid();
  const email = customerEmail(address ? data.email : data.to[0]);
  const emailId = address ? data.source_id : data.email_id;
  if (
    !email.endsWith("@example.invalid") ||
    (!(emailId === null && address) &&
      (typeof emailId !== "string" || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(emailId)))
  )
    throw invalid();
  const kind: "delivered" | "hard-bounce" | "complaint" | "provider-suppressed" =
    event.type === "email.delivered"
      ? "delivered"
      : event.type === "email.bounced"
        ? "hard-bounce"
        : event.type === "email.complained"
          ? "complaint"
          : "provider-suppressed";
  return {
    sourceTime: event.created_at as string,
    type: event.type as string,
    emailId: emailId as string | null,
    email,
    kind,
    occurredAt: new Date(event.created_at).toISOString(),
  };
}
