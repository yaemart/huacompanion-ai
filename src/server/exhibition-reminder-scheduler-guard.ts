import type { Payload, PayloadRequest } from "payload";
import { parseReminderEnvelope, reminderHash } from "../lib/exhibition-reminders";
import { readSchedulerLedger } from "./exhibition-reminder-scheduler-state";
import { ContentError } from "./content/error";

export type SchedulerWritePermit = { readonly scheduler: unique symbol };
const permits = new WeakMap<
  SchedulerWritePermit,
  { p: Payload; run: string; check: () => Promise<void> }
>();
export function schedulerPermit(
  p: Payload,
  run: string,
  check: () => Promise<void>,
): SchedulerWritePermit {
  const permit = {} as SchedulerWritePermit;
  permits.set(permit, { p, run, check });
  return permit;
}
export async function assertSchedulerReceiptWritable(
  p: Payload,
  req: Partial<PayloadRequest>,
  user: { id: number },
  receipt: string,
  permit?: SchedulerWritePermit,
) {
  const digest = reminderHash(receipt);
  const { docs } = await p.find({
    collection: "audit-events",
    depth: 0,
    req,
    where: {
      and: [
        { entity: { equals: "exhibition-reminder-scheduler" } },
        { recordId: { equals: digest } },
      ],
    },
    sort: "-id",
    limit: 1,
  });
  if (!docs.length && !permit) return;
  const proof = permit && permits.get(permit);
  const association = docs[0];
  if (!proof || proof.p !== p || association?.action !== "pending-v1")
    throw new ContentError("此调度回执不可再次应用，请先核实持久状态。", 409);
  await proof.check();
  const { state } = await readSchedulerLedger(p, req);
  const seal = parseReminderEnvelope(receipt);
  const after = association.after as {
    version: number;
    runId: string;
    scope: { key: string; locale: string };
  };
  if (
    after?.version !== 1 ||
    after.runId !== proof.run ||
    association.actor !== user.id ||
    state.runId !== proof.run ||
    state.owner !== user.id ||
    seal.actor !== user.id ||
    state.pending?.digest !== digest ||
    state.pending.scope.key !== seal.key ||
    state.pending.scope.locale !== seal.locale ||
    after.scope?.key !== seal.key ||
    after.scope.locale !== seal.locale
  )
    throw new ContentError("调度运行或未决回执已变化。", 409);
}
