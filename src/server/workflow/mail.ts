export type MailMessage = { to: string; subject: string; text: string; idempotencyKey: string };
export type MailResult = {
  status: "sent" | "disabled" | "retry" | "uncertain" | "failed";
  providerId?: string;
  retryAfterMs?: number;
};
export function configuredMailEnabled(env: Record<string, string | undefined> = process.env) {
  return (
    env.WORKFLOW_MAIL_ENABLED === "true" && !!env.WORKFLOW_MAIL_API_KEY && !!env.WORKFLOW_MAIL_FROM
  );
}
/** Fixed provider URL prevents secrets being forwarded to arbitrary endpoints. Provider retains keys 24h. */
export async function sendConfiguredMail(
  message: MailMessage,
  options: { env?: Record<string, string | undefined>; fetch?: typeof fetch } = {},
): Promise<MailResult> {
  const env = options.env || process.env;
  if (!configuredMailEnabled(env)) return { status: "disabled" };
  if (
    !message.idempotencyKey ||
    message.idempotencyKey.length > 256 ||
    message.text.length > 20000 ||
    message.subject.length > 200 ||
    !/^\S+@\S+\.\S+$/.test(message.to)
  )
    return { status: "failed" };
  try {
    const r = await (options.fetch || fetch)("https://api.resend.com/emails", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Bearer ${env.WORKFLOW_MAIL_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": message.idempotencyKey,
      },
      body: JSON.stringify({
        from: env.WORKFLOW_MAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    });
    if (r.status === 429 || r.status >= 500) {
      const h = r.headers.get("retry-after");
      const seconds = h ? Number(h) : NaN;
      const wait = Number.isFinite(seconds)
        ? seconds * 1000
        : h
          ? Date.parse(h) - Date.now()
          : 30000;
      return {
        status: "retry",
        retryAfterMs: Math.max(30000, Math.min(3600000, Number.isFinite(wait) ? wait : 30000)),
      };
    }
    if (r.status === 409) return { status: "uncertain" };
    if (!r.ok) return { status: "failed" };
    const reader = r.body?.getReader();
    if (!reader) return { status: "uncertain" };
    let size = 0;
    const chunks: Uint8Array[] = [];
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 16384) {
        await reader.cancel();
        return { status: "uncertain" };
      }
      chunks.push(chunk.value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return typeof body.id === "string"
      ? { status: "sent", providerId: body.id }
      : { status: "uncertain" };
  } catch {
    return { status: "uncertain" };
  }
}
