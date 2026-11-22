import { createHash } from "node:crypto";
import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";
import { executeSQL } from "./db-types";
import type { MailResult } from "./workflow/mail";
export type DispatchQuery = (s: ReturnType<typeof sql>) => Promise<Record<string, unknown>[]>;
export type DispatchWait = {
  reason: "rate-limit" | "subscription-priority";
  nextAttemptAt: string;
};
const lock = sql`SELECT pg_advisory_xact_lock(726284)`;
const digest = (owner: string) => createHash("sha256").update(owner).digest("hex");
export async function readDispatchWait(
  query: DispatchQuery,
  priority?: () => Promise<boolean>,
): Promise<DispatchWait | null> {
  if (process.env.APP_ENV !== "local") return null;
  const first = priority ? await priority() : false;
  const [clock] = await query(sql`SELECT clock_timestamp()::text AS now,
    (SELECT next_at::text FROM local_mail_dispatch WHERE key='local') AS next`);
  if (first)
    return {
      reason: "subscription-priority",
      nextAttemptAt: new Date(Date.parse(String(clock.now)) + 1001).toISOString(),
    };
  return clock.next && Date.parse(String(clock.next)) > Date.parse(String(clock.now))
    ? { reason: "rate-limit", nextAttemptAt: new Date(String(clock.next)).toISOString() }
    : null;
}
export async function admitDispatch(
  query: DispatchQuery,
  owner?: string,
  holdMs = 1000,
  priority?: () => Promise<boolean>,
) {
  if (process.env.APP_ENV !== "local") return null;
  const [held] = await query(sql`SELECT pg_try_advisory_xact_lock(726284) AS held`);
  if (!held.held) {
    const [clock] = await query(sql`SELECT clock_timestamp()::text AS now`);
    return {
      reason: "rate-limit" as const,
      nextAttemptAt: new Date(Date.parse(String(clock.now)) + 1001).toISOString(),
    };
  }
  const wait = await readDispatchWait(query, priority);
  if (wait) return wait;
  await query(sql`INSERT INTO local_mail_dispatch(key,owner,next_at,created_at,updated_at)
    VALUES('local',${owner ? digest(owner) : null},clock_timestamp()+${holdMs + 1}*interval '1 millisecond',clock_timestamp(),clock_timestamp())
    ON CONFLICT(key) DO UPDATE SET owner=excluded.owner,next_at=excluded.next_at,updated_at=excluded.updated_at`);
  return null;
}
export async function ownsDispatch(query: DispatchQuery, owner: string) {
  if (process.env.APP_ENV !== "local") return true;
  await query(lock);
  return !!(
    await query(sql`SELECT id FROM local_mail_dispatch
    WHERE key='local' AND owner=${digest(owner)} AND next_at>clock_timestamp()`)
  ).length;
}
export async function finishDispatch(query: DispatchQuery, owner?: string) {
  if (process.env.APP_ENV === "local")
    await query(sql`UPDATE local_mail_dispatch SET owner=NULL,
    next_at=clock_timestamp()+interval '1001 milliseconds',updated_at=clock_timestamp()
    WHERE key='local' AND owner IS NOT DISTINCT FROM ${owner ? digest(owner) : null}`);
}
export async function withLocalTransport(
  p: Payload,
  owner: string,
  send: () => Promise<MailResult>,
): Promise<MailResult> {
  if (process.env.APP_ENV !== "local") return send();
  const id = await p.db.beginTransaction();
  if (!id) throw Error("Dispatch transaction required");
  try {
    const query: DispatchQuery = async (s) => (await executeSQL(p, id, s)).rows;
    const result: MailResult = (await ownsDispatch(query, owner))
      ? await send()
      : { status: "retry", retryAfterMs: 1001 };
    await finishDispatch(query, owner);
    await p.db.commitTransaction(id);
    return result;
  } catch (error) {
    await p.db.rollbackTransaction(id);
    throw error;
  }
}
