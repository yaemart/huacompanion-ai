import { createHash, createHmac, randomUUID } from "node:crypto";
import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";
import { subscriptionActionURL } from "../lib/subscription-action";
import { subscriptionTopics } from "../lib/subscription-topics";
import type { PublicPolicyData } from "../lib/immigration-policy";
import {
  isPolicySelection,
  policyMailBody,
  policyMailReference,
  publishedPolicySelection,
  type PolicySelection,
} from "./policy-subscription";
import { contentTransaction } from "./content/service";
import { trialAccess } from "../lib/trial-access";
import { credentialDigest, credentialLifetimes, subscriptionLockKey } from "./subscriptions";
import {
  configuredMailEnabled,
  sendConfiguredMail,
  type MailMessage,
  type MailResult,
} from "./workflow/mail";

type Statement = ReturnType<typeof sql>;
type Query = (statement: Statement) => Promise<Record<string, unknown>[]>;
type Job = {
  id: number;
  key: string;
  subscription_id: number;
  consent_version: string;
  live_version: string;
  email: string;
  topic: string;
  locale: string;
  privacy_version: string;
  consent_status: string;
  site_origin: string;
  deadline: string;
  lease_active: boolean;
  within_window: boolean;
  attempted_at: string[] | null;
  message_hash: string | null;
  lease: string | null;
  status: string;
  policy_selection: PolicySelection | null;
  deliver_policy: boolean;
};
const eligible = (job: Job, origin: string) =>
  (!job.policy_selection || isPolicySelection(job.policy_selection)) &&
  (job.deliver_policy
    ? !!job.policy_selection && job.consent_status === "confirmed"
    : job.consent_status === "pending" ||
      (!!job.policy_selection && job.consent_status === "confirmed")) &&
  job.consent_version === job.live_version &&
  (job.policy_selection?.privacyVersion ?? job.privacy_version) ===
    process.env.PRIVACY_VERSION?.trim() &&
  job.site_origin === origin &&
  job.within_window;
const due = sql`(status = 'queued' AND (next_at IS NULL OR next_at <= statement_timestamp()))
  OR (status IN ('running','retry','uncertain') AND next_at <= statement_timestamp())`;

function transaction<T>(payload: Payload, work: (query: Query) => Promise<T>) {
  return payload.db.drizzle.transaction((db) =>
    work(
      async (statement) =>
        (await db.execute(statement as unknown as Parameters<typeof db.execute>[0])).rows,
    ),
  );
}

async function readJob(query: Query, id: number) {
  const rows = await query(sql`
    SELECT j.*, s.email, s.topic, s.locale, s.privacy_version, s.status AS consent_status, s.consent_version AS live_version,
      j.next_at > statement_timestamp() AS lease_active,
      d.deadline::text AS deadline, d.deadline > statement_timestamp() AS within_window
    FROM subscription_mail_jobs j JOIN subscriptions s ON s.id=j.subscription_id
    CROSS JOIN LATERAL (
      SELECT CASE WHEN j.deliver_policy THEN
        COALESCE((j.attempted_at->>0)::timestamptz + interval '23 hours', j.created_at + interval '48 hours')
        ELSE j.created_at + interval '23 hours' END AS deadline
    ) d WHERE j.id=${id}
  `);
  return rows[0] as Job | undefined;
}

async function lock(query: Query, email: string, topic: string) {
  await query(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${subscriptionLockKey(email, topic)}, 0))`,
  );
}

async function finish(
  query: Query,
  id: number,
  state: string,
  next: string | null = null,
  attempted = false,
) {
  await query(sql`
    UPDATE subscription_mail_jobs SET status=${state}, next_at=${next}, lease=NULL, updated_at=statement_timestamp(),
      attempted_at=CASE WHEN ${attempted} THEN jsonb_set(attempted_at, '{-1}', to_jsonb(statement_timestamp())) ELSE attempted_at END
    WHERE id=${id}
  `);
}

function messageFor(job: Job, origin: string, policy?: PublicPolicyData) {
  const secret = process.env.PAYLOAD_SECRET!;
  const token = (purpose: string) =>
    createHmac("sha256", secret)
      .update(`subscription-delivery:v1:${purpose}:${job.key}`)
      .digest("hex");
  const tokens = { confirm: token("confirm"), unsubscribe: token("unsubscribe") };
  const locale = (job.policy_selection?.locale ?? job.locale) === "zh" ? "zh" : "en";
  const confirm = subscriptionActionURL(origin, "confirm", locale, tokens.confirm);
  const unsubscribe = subscriptionActionURL(origin, "unsubscribe", locale, tokens.unsubscribe);
  const oneClick = new URL("/api/subscriptions/one-click", origin);
  oneClick.searchParams.set("token", tokens.unsubscribe);
  const zh = locale === "zh";
  const topic =
    subscriptionTopics[job.topic]?.[zh ? "zh" : "en"] ??
    (zh ? "单场展会 · " : "Exhibition · ") + job.topic.slice("exhibition:".length);
  const message: MailMessage = {
    to: job.email,
    subject: zh ? `华伴 · 请确认订阅：${topic}` : `Hua Companion · Confirm subscription: ${topic}`,
    text: zh
      ? `确认订阅：${confirm}\n退订：${unsubscribe}\n\n订阅主题：${topic}。如果不是您申请的，可以忽略这封邮件。`
      : `Confirm: ${confirm}\nUnsubscribe: ${unsubscribe}\n\nTopic: ${topic}. If you did not request it, you can ignore this email.`,
    idempotencyKey: `subscription-confirm:${job.key}`,
    headers: {
      "List-Unsubscribe": `<${oneClick}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
  if (policy) {
    message.subject = zh
      ? "华伴 · 您选中的政策参考资料"
      : "Hua Companion · Your selected policy reference";
    message.text = `${policyMailBody(policy, locale)}\n\n${zh ? "退订" : "Unsubscribe"}: ${unsubscribe}`;
    message.idempotencyKey = job.key;
  } else if (job.policy_selection) {
    message.text += zh
      ? "\n\n确认后，您选中的公开政策资料会另发一封邮件。"
      : "\n\nAfter confirmation, your selected published policy reference will arrive in a separate email.";
  }
  const hash = createHash("sha256")
    .update(JSON.stringify([process.env.WORKFLOW_MAIL_FROM, message]))
    .digest("hex");
  return { tokens, message, hash };
}

async function claim(payload: Payload, id: number, origin: string, policy?: PublicPolicyData) {
  return transaction(payload, async (query) => {
    const initial = await readJob(query, id);
    if (!initial) return;
    await lock(query, initial.email, "");
    await lock(query, initial.email, initial.topic);
    const job = await readJob(query, id);
    if (
      !job ||
      !(await query(sql`SELECT id FROM subscription_mail_jobs WHERE id=${id} AND (${due})`)).length
    )
      return;
    const attempts = job.attempted_at?.length ?? 0;
    if (!eligible(job, origin) || attempts >= 5) {
      await finish(query, id, attempts ? "uncertain" : "cancelled");
      return;
    }
    const [quota] = await query(sql`
      WITH cutoff AS (
        SELECT greatest(max(a.at::timestamptz) + interval '15 minutes',
          CASE WHEN count(*) >= 5 THEN min(a.at::timestamptz) + interval '24 hours' END) AS next
        FROM subscription_mail_jobs j JOIN subscriptions s ON s.id = j.subscription_id
        CROSS JOIN LATERAL jsonb_array_elements_text(j.attempted_at) a(at)
        WHERE s.email=${job.email} AND a.at::timestamptz > statement_timestamp() - interval '24 hours'
      )
      SELECT next::text FROM cutoff WHERE next > statement_timestamp()
    `);
    if (typeof quota?.next === "string") {
      await finish(query, id, job.status === "running" ? "uncertain" : job.status, quota.next);
      return;
    }
    if (
      job.deliver_policy &&
      (!policy ||
        !job.policy_selection ||
        policyMailReference(job.policy_selection.locale, policy) !== job.policy_selection.reference)
    ) {
      await finish(query, id, attempts ? "uncertain" : "cancelled");
      return;
    }
    const { message, hash, tokens } = messageFor(job, origin, policy);
    if (job.message_hash && hash !== job.message_hash) {
      await finish(query, id, "uncertain");
      return;
    }
    if (!job.message_hash)
      for (const purpose of job.deliver_policy
        ? (["unsubscribe"] as const)
        : (["confirm", "unsubscribe"] as const))
        await query(sql`
          INSERT INTO subscription_credentials (subscription_id, purpose, token_hash, version, expires_at, policy_request_key)
          VALUES (${job.subscription_id}, ${purpose}, ${credentialDigest(purpose, tokens[purpose])},
            ${job.consent_version}, statement_timestamp() + ${credentialLifetimes[purpose]} * interval '1 millisecond',
            ${purpose === "confirm" && job.policy_selection ? job.key : null})
        `);
    const lease = randomUUID();
    // Reserve through the 60-second lease and 10-second transport timeout in case the worker dies.
    await query(sql`
      UPDATE subscription_mail_jobs SET status='running', lease=${lease}, message_hash=${hash},
        attempted_at=COALESCE(attempted_at,'[]'::jsonb) || jsonb_build_array(statement_timestamp() + interval '70 seconds'),
        next_at=statement_timestamp() + interval '1 minute', updated_at=statement_timestamp()
      WHERE id=${id}
    `);
    return { job, lease, message };
  });
}

function mailOrigin(mockSender: boolean) {
  const env = process.env;
  const site = URL.parse(env.APP_URL ?? "");
  const access = trialAccess(null, env);
  const localMock =
    mockSender &&
    env.APP_ENV === "local" &&
    site?.protocol === "http:" &&
    site.hostname === "127.0.0.1";
  if (
    env.SUBSCRIPTIONS_ENABLED === "true" &&
    env.SUBSCRIPTION_REQUESTS_ENABLED === "true" &&
    env.SUBSCRIPTION_MAIL_LINKS_VERIFIED === "true" &&
    access !== "maintenance" &&
    access !== "unavailable" &&
    configuredMailEnabled() &&
    env.PRIVACY_VERSION?.trim() &&
    (env.PAYLOAD_SECRET?.length ?? 0) >= 32 &&
    site &&
    (site.protocol === "https:" || localMock) &&
    !site.username &&
    !site.password
  )
    return site.origin;
}

export async function runSubscriptionMail(
  payload: Payload,
  send?: (message: MailMessage) => Promise<MailResult>,
) {
  if (!send && !["trial", "production"].includes(process.env.APP_ENV ?? "")) return;
  const deliver = send ?? sendConfiguredMail;
  const origin = mailOrigin(!!send);
  if (!origin || !(await payload.findGlobal({ slug: "workflow-settings" })).emailEnabled) return;
  const rows = await transaction(payload, (query) =>
    query(sql`
    SELECT id, deliver_policy, policy_selection FROM subscription_mail_jobs WHERE ${due} ORDER BY created_at LIMIT 20
  `),
  );
  const sendJob = async (id: number, policy?: PublicPolicyData) => {
    const claimed = await claim(payload, id, origin, policy);
    if (!claimed) return;
    await transaction(payload, async (query) => {
      await lock(query, claimed.job.email, "");
      await lock(query, claimed.job.email, claimed.job.topic);
      const job = await readJob(query, id);
      if (!job || job.lease !== claimed.lease || !job.lease_active) return;
      const attempts = job.attempted_at?.length ?? 1;
      if (!eligible(job, origin)) {
        await finish(query, id, attempts > 1 ? "uncertain" : "cancelled");
        return;
      }
      let result: MailResult = { status: "disabled" };
      const [settings] = await query(sql`SELECT email_enabled FROM workflow_settings LIMIT 1`);
      const enabled = mailOrigin(!!send) === origin && settings?.email_enabled === true;
      if (enabled) {
        try {
          result = await deliver(claimed.message);
        } catch {
          result = { status: "uncertain" };
        }
      }
      const delay = Math.max(result.retryAfterMs ?? 0, 30000 * 2 ** (attempts - 1));
      const [{ now }] = await query(sql`SELECT statement_timestamp()::text AS now`);
      const next = Date.parse(String(now)) + delay;
      const retry = ["disabled", "retry", "uncertain"].includes(result.status);
      const canRetry = retry && attempts < 5 && next < Date.parse(job.deadline);
      const status =
        result.status === "sent" || (result.status === "failed" && attempts === 1)
          ? result.status
          : canRetry && result.status !== "uncertain"
            ? "retry"
            : "uncertain";
      await finish(query, id, status, canRetry ? new Date(next).toISOString() : null, enabled);
    });
  };
  for (const row of rows) {
    if (!row.deliver_policy || !isPolicySelection(row.policy_selection)) {
      await sendJob(Number(row.id));
      continue;
    }
    // Hold publication steady from the final read through the provider attempt.
    const selection = row.policy_selection;
    await contentTransaction(payload, async (req) =>
      sendJob(Number(row.id), await publishedPolicySelection(payload, selection, req)),
    );
  }
}
