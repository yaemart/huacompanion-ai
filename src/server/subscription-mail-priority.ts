import type { Payload, PayloadRequest } from "payload";
import { sql } from "@payloadcms/db-postgres";
import { executeSQL } from "./db-types";
import { customerEmail } from "../lib/customer";
import { subscriptionAttemptBudgetSQL } from "./subscription-attempt-budget";
import { mailJobSQL, due, eligible, mailOrigin, messageFor, type Job } from "./subscription-mail";
import { publishedPolicySelection } from "./policy-subscription";
export async function hasSubscriptionPriority(p: Payload, req: Partial<PayloadRequest>) {
  const origin = mailOrigin(true);
  if (!origin) return false;
  const query = async (s: ReturnType<typeof sql>) =>
    (await executeSQL(p, (await req.transactionID)!, s)).rows;
  if (!(await query(sql`SELECT email_enabled FROM workflow_settings LIMIT 1`))[0]?.email_enabled)
    return false;
  const jobs = ((await query(mailJobSQL(due))) as Job[]).filter((job) => {
    try {
      return (
        eligible(job, origin) && (job.attempted_at?.length ?? 0) < 5 && !!customerEmail(job.email)
      );
    } catch {
      return false;
    }
  });
  const blocked = new Set(
    (await query(subscriptionAttemptBudgetSQL(jobs.map((j) => j.email)))).map((r) => r.email),
  );
  for (const job of jobs) {
    if (blocked.has(customerEmail(job.email))) continue;
    const policy =
      job.deliver_policy && job.policy_selection
        ? await publishedPolicySelection(p, job.policy_selection, req)
        : undefined;
    if (job.deliver_policy && !policy) continue;
    if (job.message_hash && messageFor(job, origin, policy).hash !== job.message_hash) continue;
    return true;
  }
  return false;
}
