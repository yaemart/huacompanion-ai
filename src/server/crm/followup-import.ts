import { createHmac, randomUUID } from "node:crypto";
import { sql } from "@payloadcms/db-postgres";
import type { Payload, PayloadRequest } from "payload";
import { isAdmin, relationID } from "../../cms/access";
import { validOwner } from "../../cms/staff-guards";
import { CrmError } from "../../lib/crm";
import { customerTransaction } from "../customer/service";
import { currentActor, type CrmActor } from "./access";
import { appendFollowupEvent } from "./followup-events";
import { followupReadTransaction } from "./followup-read";
import { sourceRows, cutoverMailGate, suppressUnattemptedMail } from "./followup-sources";
export interface ImportItem {
  inquiryID: number;
  updatedAt: string;
  slotRevision: number;
  state: "eligible" | "empty" | "closed" | "blocked" | "managed";
  reason?: string;
}
export interface ImportReport {
  eligible: number;
  imported: number;
  unchanged: number;
  issues: { inquiryID: number; code: string }[];
  items: ImportItem[];
  page: number;
  limit: number;
  total: number;
}
type Selection = { inquiryID: number; expectedUpdatedAt: string; expectedSlotRevision: number };
type ImportCommand = {
  action: "importLegacyFollowups" | "undoLegacyFollowupImport";
  operationKey: string;
  items: Selection[];
};
const conflict = () => new CrmError("咨询或接管预览已变化，请重新核对", 409);
const bad = () => new CrmError("接管参数无效");
function id(v: unknown, zero = false) {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < (zero ? 0 : 1)) throw bad();
  return v;
}
export function parseImportCommand(raw: unknown): ImportCommand {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw bad();
  const o = raw as Record<string, unknown>;
  if (
    Object.keys(o).some((k) => !["action", "operationKey", "items"].includes(k)) ||
    !["importLegacyFollowups", "undoLegacyFollowupImport"].includes(String(o.action))
  )
    throw bad();
  if (
    typeof o.operationKey !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(o.operationKey)
  )
    throw bad();
  if (!Array.isArray(o.items) || !o.items.length || o.items.length > 20) throw bad();
  const items = o.items.map((v) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) throw bad();
    const x = v as Record<string, unknown>;
    if (
      Object.keys(x).some(
        (k) => !["inquiryID", "expectedUpdatedAt", "expectedSlotRevision"].includes(k),
      )
    )
      throw bad();
    if (
      typeof x.expectedUpdatedAt !== "string" ||
      !Number.isFinite(Date.parse(x.expectedUpdatedAt))
    )
      throw bad();
    return {
      inquiryID: id(x.inquiryID),
      expectedUpdatedAt: new Date(x.expectedUpdatedAt).toISOString(),
      expectedSlotRevision: id(x.expectedSlotRevision, true),
    };
  });
  if (new Set(items.map((x) => x.inquiryID)).size !== items.length) throw bad();
  return {
    action: o.action as ImportCommand["action"],
    operationKey: o.operationKey.toLowerCase(),
    items,
  };
}
function admin(actor: CrmActor) {
  if (!isAdmin(actor)) throw new CrmError("需要管理员核对旧来源", 403);
}
const iso = (v: unknown) => {
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
};
async function source(p: Payload, id: number, req: Partial<PayloadRequest>) {
  const row = (
    await sourceRows(
      p,
      sql`SELECT id,owner_id,team_id,status,coordination_stage,next_follow_up,updated_at,follow_ups,notes FROM inquiries WHERE id=${id}`,
      req,
    )
  )[0];
  if (!row) throw new CrmError("咨询不可用", 404);
  const updatedAt = iso(row.updated_at);
  if (!updatedAt) throw new CrmError("咨询版本不可用", 503);
  const date = row.next_follow_up === null ? null : iso(row.next_follow_up);
  const snapshot = {
    inquiryID: id,
    ownerID: row.owner_id ?? null,
    teamID: row.team_id ?? null,
    status: row.status,
    stage: row.coordination_stage ?? null,
    date: row.next_follow_up === null ? null : (date ?? "invalid"),
    updatedAt,
    history: row.follow_ups,
    notes: row.notes,
  };
  const digest = createHmac("sha256", p.secret).update(JSON.stringify(snapshot)).digest("hex");
  return {
    id,
    updatedAt,
    date,
    invalid: row.next_follow_up !== null && !date,
    closed: row.status === "closed" || row.coordination_stage === "closed",
    ownerID: Number(row.owner_id) || null,
    teamID: Number(row.team_id) || null,
    digest,
  };
}
async function inspect(p: Payload, id: number, req: Partial<PayloadRequest>) {
  const q = await source(p, id, req);
  const slot = (
    await p.find({
      collection: "crm-followup-slots",
      where: { inquiry: { equals: id } },
      limit: 1,
      depth: 0,
      req,
    })
  ).docs[0];
  let state: ImportItem["state"] =
    slot?.cutoverState === "managed"
      ? "managed"
      : q.invalid
        ? "blocked"
        : q.closed
          ? "closed"
          : q.date
            ? "eligible"
            : "empty";
  let reason = q.invalid ? "invalid-date" : undefined;
  const badLinks = await sourceRows(
    p,
    sql`SELECT l.id FROM crm_inquiry_links l JOIN crm_clients c ON c.id=l.client_id WHERE l.inquiry_id=${id} AND l.active AND c.team_id IS DISTINCT FROM ${q.teamID}::integer`,
    req,
  );
  if (badLinks.length || !q.teamID) {
    state = "blocked";
    reason = badLinks.length ? "cross-team-link" : "missing-team";
  }
  if (
    state === "eligible" &&
    (
      await p.count({
        collection: "crm-followups",
        where: { and: [{ inquiry: { equals: id } }, { state: { equals: "pending" } }] },
        req,
      })
    ).totalDocs >= 50
  ) {
    state = "blocked";
    reason = "pending-capacity";
  }
  if (slot?.cutoverState !== "managed" && (await cutoverMailGate(p, req, id)).blocked) {
    state = "blocked";
    reason = "delivery-recovery-required";
  }
  return {
    q,
    slot,
    item: {
      inquiryID: id,
      updatedAt: q.updatedAt,
      slotRevision: slot?.revision ?? 0,
      state,
      ...(reason ? { reason } : {}),
    } as ImportItem,
  };
}
export async function preflightFollowupImport(
  p: Payload,
  user: CrmActor,
  options: { page?: number; limit?: number } = {},
) {
  const page = options.page ?? 1,
    limit = options.limit ?? 20;
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 100000 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 50
  )
    throw bad();
  return followupReadTransaction(p, user, async (actor, req) => {
    admin(actor);
    const docs = await sourceRows(
      p,
      sql`SELECT id FROM inquiries ORDER BY id LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
      req,
    );
    const count = await sourceRows(p, sql`SELECT count(*) AS total FROM inquiries`, req);
    const report: ImportReport = {
      eligible: 0,
      imported: 0,
      unchanged: 0,
      issues: [],
      items: [],
      page,
      limit,
      total: Number(count[0].total),
    };
    for (const d of docs) {
      const { item } = await inspect(p, Number(d.id), req);
      report.items.push(item);
      if (item.state === "eligible") report.eligible++;
      if (item.reason) report.issues.push({ inquiryID: Number(d.id), code: item.reason });
    }
    return report;
  });
}
const proof = (p: Payload, i: ImportCommand) => ({
  epoch: createHmac("sha256", p.secret).update("crm-epoch-v1").digest("hex"),
  inputDigest: createHmac("sha256", p.secret)
    .update("crm-followup-import-v1:" + JSON.stringify(i))
    .digest("hex"),
});
async function runImport(p: Payload, user: CrmActor, raw: unknown, undo: boolean) {
  const i = parseImportCommand(raw);
  if ((i.action === "undoLegacyFollowupImport") !== undo) throw bad();
  return customerTransaction(
    p,
    async (req) => {
      const actor = await currentActor(p, user, req);
      admin(actor);
      req.user = { ...actor, collection: "staff" };
      const signature = proof(p, i),
        key = `${actor.id}:${i.operationKey}`;
      const old = (
        await p.find({
          collection: "crm-operations",
          where: { key: { equals: key } },
          limit: 1,
          depth: 0,
          req,
        })
      ).docs[0];
      for (const choice of i.items) await source(p, choice.inquiryID, req);
      if (old) {
        if (
          old.action !== i.action ||
          old.epoch !== signature.epoch ||
          old.inputDigest !== signature.inputDigest
        )
          throw conflict();
        const r = old.result as unknown as ImportReport;
        if (
          !r ||
          !Array.isArray(r.items) ||
          !Array.isArray(r.issues) ||
          ![r.imported, r.eligible, r.unchanged].every(Number.isSafeInteger)
        )
          throw new CrmError("接管回执不可用", 503);
        return r;
      }
      const report: ImportReport = {
        eligible: 0,
        imported: 0,
        unchanged: 0,
        issues: [],
        items: [],
        page: 1,
        limit: i.items.length,
        total: i.items.length,
      };
      for (const choice of i.items) {
        const { q, slot, item } = await inspect(p, choice.inquiryID, req);
        if (
          q.updatedAt !== choice.expectedUpdatedAt ||
          (slot?.revision ?? 0) !== choice.expectedSlotRevision
        )
          throw conflict();
        if (undo) {
          if (!slot) throw conflict();
          const provenance = slot.provenance as Record<string, unknown>;
          if (
            !provenance ||
            provenance.source !== "legacy-import" ||
            provenance.sourceDigest !== q.digest ||
            slot.revision !== 1 ||
            !Array.isArray(provenance.suppressedMailIDs) ||
            provenance.suppressedMailIDs.length
          )
            throw new CrmError("接管后已有变化，不能撤销导入，请前向修复", 409);
          const taskID = relationID(slot.currentTask);
          if (taskID) {
            const task = await p.findByID({
              collection: "crm-followups",
              id: taskID,
              depth: 0,
              req,
            });
            const events = await p.find({
              collection: "crm-followup-events",
              where: { task: { equals: taskID } },
              pagination: false,
              depth: 0,
              req,
            });
            if (
              task.type !== "primary" ||
              task.state !== "pending" ||
              task.revision !== 1 ||
              !task.needsReview ||
              events.docs.length !== 1 ||
              events.docs[0].action !== "legacy-imported"
            )
              throw conflict();
            await p.delete({ collection: "crm-followup-events", id: events.docs[0].id, req });
            await p.update({
              collection: "crm-followup-slots",
              id: slot.id,
              data: { currentTask: null },
              req,
            });
            await p.delete({ collection: "crm-followups", id: taskID, req });
          }
          await p.delete({ collection: "crm-followup-slots", id: slot.id, req });
          report.imported++;
          report.items.push({ ...item, slotRevision: 0, state: "empty" });
        } else {
          if (slot?.cutoverState === "managed") {
            report.unchanged++;
            report.items.push(item);
            continue;
          }
          const gate = await cutoverMailGate(p, req, q.id);
          if (gate.blocked) {
            report.issues.push({ inquiryID: q.id, code: "delivery-recovery-required" });
            report.items.push({ ...item, state: "blocked", reason: "delivery-recovery-required" });
            continue;
          }
          if (item.state === "eligible") report.eligible++;
          const importing = item.state === "eligible";
          let taskID: number | null = null;
          if (importing) {
            const owner = q.ownerID
              ? (
                  await p.find({
                    collection: "staff",
                    where: { id: { equals: q.ownerID } },
                    limit: 1,
                    depth: 0,
                    req,
                  })
                ).docs[0]
              : undefined;
            const task = await p.create({
              collection: "crm-followups",
              req,
              data: {
                reference: `FUP-${randomUUID()}`,
                anchorKind: "inquiry",
                inquiry: q.id,
                type: "primary",
                title: "旧咨询主跟进（待核对）",
                description: "原安排时间与原操作者未知；请核对截止及责任后继续。",
                assignee: validOwner(owner, q.teamID) ? q.ownerID : null,
                dueAt: q.date!,
                state: "pending",
                needsReview: true,
                revision: 1,
                createdBy: Number(actor.id),
              },
            });
            taskID = task.id;
            await appendFollowupEvent(p, req, task, "legacy-imported", {
              source: "legacy-import",
              originalActorKnown: false,
              originalTimeKnown: false,
            });
            report.imported++;
          }
          const blocked = item.state === "blocked";
          if (!blocked) await suppressUnattemptedMail(p, req, gate.suppress);
          const data = {
            inquiry: q.id,
            sourceKey: `legacy-inquiry:${q.id}`,
            generation: 1,
            revision: (slot?.revision ?? 0) + 1,
            currentTask: taskID,
            cutoverState: blocked ? ("blocked" as const) : ("managed" as const),
            provenance: {
              source: "legacy-import",
              sourceDigest: q.digest,
              importedBy: Number(actor.id),
              importedAt: new Date().toISOString(),
              originalActorKnown: false,
              originalTimeKnown: false,
              closedSnapshot: q.closed,
              oldDate: q.invalid ? "invalid" : q.date,
              suppressedMailIDs: blocked ? [] : gate.suppress,
              issue: item.reason ?? null,
            },
          };
          let savedRevision: number;
          if (blocked) {
            const rows = slot
              ? await sourceRows(
                  p,
                  sql`UPDATE crm_followup_slots
 SET revision=${data.revision},cutover_state='blocked',provenance=${JSON.stringify(data.provenance)}::jsonb,updated_at=now() WHERE id=${slot.id} RETURNING revision`,
                  req,
                )
              : await sourceRows(
                  p,
                  sql`INSERT INTO crm_followup_slots(inquiry_id,source_key,generation,revision,current_task_id,cutover_state,provenance)
 VALUES (${q.id},${data.sourceKey},1,1,NULL,'blocked',${JSON.stringify(data.provenance)}::jsonb) RETURNING revision`,
                  req,
                );
            savedRevision = Number(rows[0].revision);
          } else {
            const saved = slot
              ? await p.update({ collection: "crm-followup-slots", id: slot.id, data, req })
              : await p.create({ collection: "crm-followup-slots", data, req });
            savedRevision = saved.revision;
          }
          report.items.push({
            ...item,
            slotRevision: savedRevision,
            state: blocked ? "blocked" : "managed",
          });
          if (blocked) report.issues.push({ inquiryID: q.id, code: item.reason! });
        }
        await p.create({
          collection: "audit-events",
          req,
          data: {
            entity: "crm",
            recordId: String(q.id),
            action: i.action,
            actor: Number(actor.id),
            fields: "primarySource",
            before: { slotRevision: choice.expectedSlotRevision },
            after: {
              inquiryID: q.id,
              operationKey: i.operationKey,
              slotRevision: report.items.at(-1)!.slotRevision,
            },
          },
        });
      }
      await p.create({
        collection: "crm-operations",
        req,
        data: {
          actor: Number(actor.id),
          key,
          operationKey: i.operationKey,
          action: i.action,
          ...signature,
          result: { ...report },
        },
      });
      return report;
    },
    { readCommitted: true },
  );
}
export const importLegacyFollowups = (p: Payload, user: CrmActor, input: unknown) =>
  runImport(p, user, input, false);
export const undoLegacyFollowupImport = (p: Payload, user: CrmActor, input: unknown) =>
  runImport(p, user, input, true);
