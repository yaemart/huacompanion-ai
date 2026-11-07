import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

type Environment = Record<string, string | undefined>;
export class IntakeClientError extends Error {}
const cookieName = "hua_intake_client";
const digest = (secret: string, purpose: string, value: string) =>
  createHmac("sha256", secret).update(`${purpose}:${value}`).digest("hex");
const equal = (left: string, right: string) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

/** Request/NextRequest has no socket IP. Forwarded headers require authenticated gateway proof. */
export function intakeClient(
  request: Request,
  env: Environment = process.env,
): { key: string; cookie?: string } {
  const secret = env.PAYLOAD_SECRET;
  if (!secret || secret.length < 32) throw new IntakeClientError("Client identity unavailable");
  const proxy = env.TRUSTED_PROXY;
  if (proxy) {
    if (!["cloudflare", "nginx"].includes(proxy))
      throw new IntakeClientError("Invalid proxy configuration");
    const proof = env.TRUSTED_PROXY_SECRET;
    if (!proof || proof.length < 32) throw new IntakeClientError("Gateway proof unavailable");
    if (!equal(request.headers.get("X-Hua-Proxy-Secret") || "", proof))
      throw new IntakeClientError("Gateway proof required");
    const ip = request.headers.get(proxy === "cloudflare" ? "CF-Connecting-IP" : "X-Real-IP") || "";
    const version = isIP(ip);
    if (!version) throw new IntakeClientError("Gateway client address required");
    const normalized = version === 6 ? new URL(`http://[${ip}]`).hostname : ip;
    return { key: digest(secret, "intake-ip", normalized) };
  }
  const candidate = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
  if (candidate && /^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(candidate)) {
    const [id, signature] = candidate.split(".");
    if (equal(signature, digest(secret, "intake-cookie", id)))
      return { key: digest(secret, "intake-client", id) };
  }
  const id = randomBytes(32).toString("hex");
  const token = `${id}.${digest(secret, "intake-cookie", id)}`;
  const secure = env.APP_URL?.startsWith("https://") ? "; Secure" : "";
  return {
    key: digest(secret, "intake-client", id),
    cookie: `${cookieName}=${token}; Path=/api/intake; Max-Age=86400; HttpOnly; SameSite=Lax${secure}`,
  };
}

/** Technical field only: never copy it into the customer values or notification payload. */
export function hasIntakeHoneypot(input: unknown): boolean {
  if (!input || typeof input !== "object" || !("contactFax" in input)) return false;
  return input.contactFax !== "";
}
