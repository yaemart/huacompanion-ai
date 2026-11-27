import { createHmac, timingSafeEqual } from "node:crypto";
import { sql } from "@payloadcms/db-postgres";
import { createLocalReq, type Payload } from "payload";
import { isContentIdentifier } from "../lib/content-identifiers";
import { customerEmail } from "../lib/customer";
import { parseSiteLocales } from "../lib/site-locales";
import { trialAccess } from "../lib/trial-access";
import {
  planExhibitionReminder,
  reminderHash,
  parseReminderEnvelope,
  type ReminderEnvelope as Seal,
  type ReminderScope,
  type ReminderState,
} from "../lib/exhibition-reminders";
import { ContentError } from "./content/error";
import { executeSQL, transactionSession } from "./db-types";
import { requireSubscriptionAdmin } from "./subscription-management";
import { subscriptionLockKey } from "./subscriptions";
import { findExhibitionReminderAudit } from "./exhibition-reminder-history";

const collection = "exhibition-reminder-jobs";
export const previewExhibitionReminders = (p: Payload, headers: Headers, input: unknown) =>
  operate(p, headers, input, false);
export const applyExhibitionReminders = (p: Payload, headers: Headers, receipt: unknown) =>
  operate(p, headers, receipt, true);
const mac = (value: string) =>
  createHmac("sha256", process.env.PAYLOAD_SECRET!)
    .update("exhibition-reminder-v1:" + value)
    .digest("hex");

async function operate(p: Payload, headers: Headers, value: unknown, write: boolean) {
  if (process.env.APP_ENV !== "local") throw new ContentError("仅支持本地提醒模拟。", 403);
  const { user } = await p.auth({ headers });
  if (user?.collection !== "staff") throw new ContentError("请使用管理员账号登录。", 403);
  await requireSubscriptionAdmin(p, user);
  const currentSession = async (transactionID?: string | number) => {
    const req = transactionID ? await createLocalReq({ req: { transactionID } }, p) : undefined;
    const current = (await p.auth({ headers, req })).user;
    if (current?.collection !== "staff" || current.id !== user.id)
      throw new ContentError("登录会话已失效，请重新登录。", 403);
  };
  let seal: Seal | undefined;
  if (write) {
    try {
      seal = parseReminderEnvelope(value);
    } catch {
      throw new ContentError("预检凭证无效，请重新预检。", 409);
    }
  }
  const input = (write ? { key: seal?.key, locale: seal?.locale } : value) as ReminderScope;
  if (
    !input ||
    typeof input !== "object" ||
    Object.keys(input).sort().join() !== "key,locale" ||
    !isContentIdentifier(input.key) ||
    !["zh", "en"].includes(input.locale)
  )
    throw new ContentError("请选择有效的展会和语言。");
  const scope = { key: input.key, locale: input.locale };
  const scopeKey = JSON.stringify([scope.key, scope.locale]);
  const digest = reminderHash(value),
    id = await p.db.beginTransaction();
  if (!id) throw Error("Reminder transaction required");
  const req = { transactionID: id },
    db = transactionSession(p, id).db;
  const rows = async <T>(query: ReturnType<typeof sql>) =>
    (await executeSQL(p, id, query)).rows as T[];
  try {
    if (!write) await db.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    else
      for (const lock of [726271, 726281, 726272])
        await executeSQL(p, id, sql`SELECT pg_advisory_xact_lock(${lock})`);
    await requireSubscriptionAdmin(p, user, req);
    await currentSession(id);
    const saved = write
      ? await findExhibitionReminderAudit(p, req, user.id, digest, scope)
      : undefined;
    if (saved) {
      await p.db.rollbackTransaction(id);
      return saved;
    }
    const read = async (): Promise<ReminderState> => ({
      source: (
        await rows<
          NonNullable<ReminderState["source"]>
        >(sql`SELECT id, revision::float8 AS revision, body FROM content_published
        WHERE active=true AND body->>'kind'='exhibition' AND body->>'contentKey'=${scope.key} AND body->>'locale'=${scope.locale} ORDER BY id DESC LIMIT 1`)
      )[0],
      subscriptions: await rows<
        ReminderState["subscriptions"][number]
      >(sql`SELECT id,email,topic,locale,status,consent_version::float8 AS "consentVersion",
        privacy_version AS "privacyVersion", confirmed_at::text AS "confirmedAt", consented_at::text AS "consentedAt" FROM subscriptions
        WHERE topic=${"exhibition:" + scope.key} OR id IN(SELECT subscription_id FROM exhibition_reminder_jobs WHERE scope=${scopeKey})`),
      jobs: await rows<ReminderState["jobs"][number]>(
        sql`SELECT id,key,subscription_id AS subscription,body FROM exhibition_reminder_jobs WHERE scope=${scopeKey}`,
      ),
      suppressed: (
        await rows<{ hash: string }>(
          sql`SELECT recipient_hash AS hash FROM subscription_marketing_suppressions ORDER BY recipient_hash`,
        )
      ).map((r) => r.hash),
    });
    let state = await read();
    if (write) {
      const emails = state.subscriptions.map((s) => s.email);
      const normalized = emails.map((email) => {
        try {
          return customerEmail(email);
        } catch {
          return email;
        }
      });
      for (const keys of [
        normalized.map((e) => subscriptionLockKey(e, "")),
        state.subscriptions.flatMap((s, i) => [
          subscriptionLockKey(s.email, s.topic),
          subscriptionLockKey(normalized[i], s.topic),
        ]),
      ])
        for (const key of [...new Set(keys)].sort())
          await executeSQL(p, id, sql`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`);
      state = await read();
    }
    const clock = (
      await db.execute(
        "SELECT (statement_timestamp() AT TIME ZONE 'Asia/Shanghai')::date::text AS today, statement_timestamp()::text AS now /* exhibition-reminder-clock */",
      )
    ).rows[0] as { today: string; now: string };
    await currentSession(id);
    const at = new Date(clock.now).toISOString(),
      privacy = process.env.PRIVACY_VERSION?.trim() || "";
    let ready = false;
    try {
      ready =
        process.env.SUBSCRIPTIONS_ENABLED === "true" &&
        privacy.length > 0 &&
        privacy.length <= 100 &&
        (process.env.PAYLOAD_SECRET?.length ?? 0) >= 32 &&
        parseSiteLocales(process.env.SITE_LOCALES).includes(scope.locale) &&
        !["maintenance", "unavailable"].includes(trialAccess(null));
    } catch {
      /* Invalid configuration fails closed. */
    }
    let plan: ReturnType<typeof planExhibitionReminder>;
    try {
      plan = planExhibitionReminder(state, scope, clock.today, privacy);
    } catch {
      throw new ContentError("名单超过上限或资料无效，请重新预检。", write ? 409 : 400);
    }
    const fingerprint = reminderHash([
      plan.fingerprint,
      ready,
      process.env.SITE_LOCALES,
      process.env.TRIAL_MAINTENANCE,
      process.env.TRIAL_ACCESS_REQUIRED,
    ]);
    if (write) {
      const [encoded, signature] = (value as string).split(".");
      if (
        !ready ||
        seal!.actor !== user.id ||
        seal!.today !== clock.today ||
        seal!.fingerprint !== fingerprint ||
        !Number.isFinite(Date.parse(seal!.at)) ||
        Date.parse(at) < Date.parse(seal!.at) ||
        Date.parse(at) - Date.parse(seal!.at) > 600000 ||
        !timingSafeEqual(Buffer.from(signature), Buffer.from(mac(encoded)))
      )
        throw new ContentError("预检已变化或过期，请重新预检。", 409);
    }
    const snapshot = plan.snapshot && {
      title: plan.snapshot.title,
      revision: plan.snapshot.revision,
      path: plan.snapshot.path,
      startDate: plan.snapshot.startDate,
      endDate: plan.snapshot.endDate,
      venue: plan.snapshot.venue,
      address: plan.snapshot.address,
    };
    const report = {
      scope,
      snapshot,
      offset: plan.offset,
      counts: plan.counts,
      asOf: at,
      today: clock.today,
      blocked: !ready,
      replayed: false,
      currentEligibility: "checked",
      receipt: undefined as string | undefined,
    };
    if (!write) {
      if (ready) {
        const encoded = Buffer.from(
          JSON.stringify({ ...scope, actor: user.id, today: clock.today, at, fingerprint }),
        ).toString("base64url");
        report.receipt = encoded + "." + mac(encoded);
      }
      await p.db.rollbackTransaction(id);
      await currentSession();
      await requireSubscriptionAdmin(p, user);
      return report;
    }
    for (const job of plan.create)
      await p.create({
        collection,
        req,
        data: { ...job, scope: scopeKey, body: { ...job.body, actor: user.id } },
      });
    for (const change of plan.cancel)
      await p.update({
        collection,
        id: change.id,
        req,
        data: {
          body: {
            ...state.jobs.find((job) => job.id === change.id)!.body,
            status: "local-cancelled",
            cancelledAt: at,
            reason: change.reason,
            cancelledBy: user.id,
          },
        },
      });
    const audit = await p.create({
      collection: "audit-events",
      req,
      data: {
        entity: collection,
        action: "generate-local",
        recordId: digest,
        actor: user.id,
        after: { scope: scopeKey, report },
      },
    });
    await p.db.commitTransaction(id);
    if (!(await p.findByID({ collection: "audit-events", id: audit.id, disableErrors: true })))
      throw new ContentError("提交结果待核实，请用原预检凭证核对。", 409);
    return report;
  } catch (error) {
    await p.db.rollbackTransaction(id);
    throw error;
  }
}
type Report = {
  scope: ReminderScope;
  snapshot?: Record<string, unknown>;
  offset: 30 | 7 | null;
  counts: ReturnType<typeof planExhibitionReminder>["counts"];
  asOf: string;
  today: string;
  blocked: boolean;
  replayed: boolean;
  currentEligibility: string;
  receipt?: string;
};
export type ReminderReport = Report;
