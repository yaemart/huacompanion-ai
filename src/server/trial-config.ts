import type { Payload } from "payload";
import { featureNames } from "../lib/support-features";

/** Deliberate operator action only. Never call from application startup. */
export async function configureTrial(
  p: Payload,
  env: Record<string, string | undefined>,
  apply = false,
) {
  if (env.APP_ENV !== "local" && env.APP_ENV !== "trial")
    throw Error("Trial configuration is restricted to local or trial environments");
  if (env.BUSINESS_AI_ENABLED === "true")
    throw Error(
      "Set BUSINESS_AI_ENABLED=false in the deployment environment before configuring trial",
    );
  const disabled = Object.fromEntries(Object.keys(featureNames).map((key) => [key, false]));
  const after = {
    support: disabled,
    customer: { enabled: false },
    workflow: { emailEnabled: false },
  };
  if (!apply) return { applied: false, after, auditID: undefined };
  const transactionID = await p.db.beginTransaction();
  if (!transactionID) throw Error("Trial configuration requires a transaction");
  const req = { transactionID };
  try {
    const sessions = p.db.sessions as
      Record<string, { db: { execute: (query: string) => Promise<unknown> } }> | undefined;
    const session = sessions?.[transactionID];
    if (!session) throw Error("Trial configuration transaction session missing");
    // Match the existing global hooks' order before reading the audit snapshot.
    await session.db.execute("SELECT pg_advisory_xact_lock(726280)");
    await session.db.execute("SELECT pg_advisory_xact_lock(726281)");
    // Ordinary workflow settings writes use PostgreSQL ROW EXCLUSIVE locks.
    // A table lock also covers a first-ever global insert, where no row exists to lock.
    await session.db.execute('LOCK TABLE "workflow_settings" IN SHARE ROW EXCLUSIVE MODE');
    const support = await p.findGlobal({ slug: "support-settings", req });
    const customer = await p.findGlobal({ slug: "customer-settings", req });
    const workflow = await p.findGlobal({ slug: "workflow-settings", req });
    const before = {
      support: Object.fromEntries(
        Object.keys(featureNames).map((key) => [
          key,
          support[key as keyof typeof featureNames] === true,
        ]),
      ),
      customer: { enabled: customer.enabled === true },
      workflow: { emailEnabled: workflow.emailEnabled === true },
    };
    await p.updateGlobal({ slug: "support-settings", data: after.support, req });
    await p.updateGlobal({ slug: "customer-settings", data: after.customer, req });
    await p.updateGlobal({ slug: "workflow-settings", data: after.workflow, req });
    const audit = await p.create({
      collection: "audit-events",
      overrideAccess: true,
      req,
      data: {
        entity: "trial-settings",
        recordId: env.APP_ENV,
        action: "configure-trial",
        fields: "support feature switches,customer.enabled,workflow.emailEnabled",
        before,
        after,
      },
    });
    await p.db.commitTransaction(transactionID);
    return { applied: true, after, auditID: audit.id };
  } catch (error) {
    await p.db.rollbackTransaction(transactionID);
    throw error;
  }
}
