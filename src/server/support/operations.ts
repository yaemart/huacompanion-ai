import { randomUUID } from "node:crypto";
import type { Payload } from "payload";
import { isAdmin, isOperator, relationID } from "../../cms/access";
import { ContentError } from "../content/service";
import { owned, scoped, supportTransaction, keyOf } from "./service";
import { supportFeatures } from "./features";

const admin = (user: any) => {
  if (!isAdmin(user)) throw new ContentError("Administrator required", 403);
};
const boundedText = (value: unknown) => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 2000)
    throw new ContentError("Text must contain 1–2000 characters");
  return value.trim();
};
// Pagination is deliberate: a dashboard must never silently count only its first page.
async function all(p: any, collection: string, options: any = {}) {
  let page = 1;
  const docs: any[] = [];
  for (;;) {
    const result = await p.find({ collection, limit: 200, page, depth: 0, ...options });
    docs.push(...result.docs);
    if (!result.hasNextPage) break;
    page++;
  }
  return docs;
}
export async function submitSatisfaction(p: Payload, hash: string, input: any) {
  if (!hash) throw new ContentError("Session required", 403);
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5)
    throw new ContentError("Rating must be 1–5");
  const comment = input.comment ? boundedText(input.comment) : "";
  return supportTransaction(p, async (req) => {
    const c = await owned(p, hash, input.id, req);
    if (c.status !== "resolved")
      throw new ContentError("Feedback is available after resolution", 409);
    const db = p as any;
    const dedupe = `feedback:${c.id}`;
    const existing = (
      await db.find({
        collection: "support-feedback",
        where: { dedupe: { equals: dedupe } },
        limit: 1,
        req,
      })
    ).docs[0];
    if (existing) {
      if (existing.rating !== input.rating || (existing.comment || "") !== comment)
        throw new ContentError("Feedback already submitted", 409);
      return { ok: true };
    }
    await db.create({
      collection: "support-feedback",
      data: { conversation: c.id, dedupe, rating: input.rating, comment },
      req,
    });
    return { ok: true };
  });
}
export async function addSupportReview(p: Payload, user: any, input: any) {
  const note = boundedText(input.note);
  if (!["knowledge-gap", "quality", "follow-up"].includes(input.category))
    throw new ContentError("Invalid review category");
  return supportTransaction(p, async (req) => {
    const c = await scoped(p, user, input.id, req);
    const db = p as any;
    const dedupe = `review:${c.id}:${user.id}:${keyOf(input.key)}`;
    const old = (
      await db.find({
        collection: "support-reviews",
        where: { dedupe: { equals: dedupe } },
        limit: 1,
        req,
      })
    ).docs[0];
    if (old) {
      if (old.note !== note || old.category !== input.category)
        throw new ContentError("Request key conflict", 409);
      return { ok: true };
    }
    await db.create({
      collection: "support-reviews",
      data: { conversation: c.id, actor: user.id, dedupe, category: input.category, note },
      req,
    });
    return { ok: true };
  });
}
export function summarizeOperations(
  conversations: any[],
  runs: any[],
  feedback: any[],
  reviews: any[],
  now = Date.now(),
) {
  const terminal = runs.filter((r) => ["succeeded", "failed", "discarded"].includes(r.status));
  const durations = terminal
    .map((r) => Date.parse(r.updatedAt) - Date.parse(r.createdAt))
    .filter((n) => Number.isFinite(n) && n >= 0);
  const validUsage = runs.filter(
    (r) =>
      Number.isSafeInteger(r.usage?.inputTokens) &&
      r.usage.inputTokens >= 0 &&
      Number.isSafeInteger(r.usage?.outputTokens) &&
      r.usage.outputTokens >= 0,
  );
  return {
    conversations: conversations.length,
    waiting: conversations.filter((c) => c.status !== "resolved" && c.mode === "waiting").length,
    overdue: conversations.filter(
      (c) => c.status !== "resolved" && c.nextFollowUp && Date.parse(c.nextFollowUp) < now,
    ).length,
    resolved: conversations.filter((c) => c.status === "resolved").length,
    ai: {
      queued: runs.filter((r) => r.status === "queued").length,
      running: runs.filter((r) => r.status === "running").length,
      succeeded: runs.filter((r) => r.status === "succeeded").length,
      failed: runs.filter((r) => r.status === "failed").length,
      discarded: runs.filter((r) => r.status === "discarded").length,
      expiredLeases: runs.filter(
        (r) => r.status === "running" && r.leaseUntil && Date.parse(r.leaseUntil) < now,
      ).length,
      averageQueueToCompletionMs: durations.length
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null,
      reservedTokens: runs.reduce((n, r) => n + (Number.isFinite(r.reserved) ? r.reserved : 0), 0),
      reportedTokens: validUsage.reduce(
        (n, r) => n + r.usage.inputTokens + r.usage.outputTokens,
        0,
      ),
      usageUnknown: runs.filter(
        (r) => ["succeeded", "failed", "discarded"].includes(r.status) && !validUsage.includes(r),
      ).length,
    },
    satisfaction: {
      responses: feedback.length,
      average: feedback.length
        ? feedback.reduce((n, r) => n + r.rating, 0) / feedback.length
        : null,
    },
    knowledgeGaps: reviews.filter((r) => r.category === "knowledge-gap").length,
  };
}
/** Durations use message event timestamps, never mutable conversation updatedAt. */
export function conversationTimings(conversations: any[], messages: any[]) {
  const firstResponse: number[] = [],
    resolution: number[] = [];
  let unanswered = 0,
    missingResolution = 0;
  const byConversation = new Map<string, any[]>();
  for (const message of messages) {
    const key = String(relationID(message.conversation));
    const list = byConversation.get(key) || [];
    list.push(message);
    byConversation.set(key, list);
  }
  for (const c of conversations) {
    const history = (byConversation.get(String(c.id)) || [])
      .filter((m) => Number.isFinite(Date.parse(m.createdAt)))
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id - b.id);
    const customer = history.find((m) => m.author === "customer" && m.visibility === "public");
    if (!customer) {
      if (c.status === "resolved") missingResolution++;
      continue;
    }
    const start = Date.parse(customer.createdAt);
    const reply = history.find(
      (m) =>
        m.visibility === "public" &&
        ["staff", "ai"].includes(m.author) &&
        Date.parse(m.createdAt) >= start &&
        (Date.parse(m.createdAt) > start || m.id > customer.id),
    );
    if (reply) firstResponse.push(Date.parse(reply.createdAt) - start);
    else unanswered++;
    if (c.status === "resolved") {
      const events = history.filter((m) => {
        if (m.author !== "system" || m.visibility !== "internal" || Date.parse(m.createdAt) < start)
          return false;
        try {
          return JSON.parse(m.text).action === "resolve";
        } catch {
          return false;
        }
      });
      const resolved = events.at(-1);
      if (resolved) resolution.push(Date.parse(resolved.createdAt) - start);
      else missingResolution++;
    }
  }
  const average = (values: number[]) =>
    values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
  return {
    averageFirstResponseMs: average(firstResponse),
    firstResponseSamples: firstResponse.length,
    unansweredConversations: unanswered,
    averageResolutionMs: average(resolution),
    resolutionSamples: resolution.length,
    resolvedWithoutTimestamp: missingResolution,
  };
}
export async function operationsReport(p: Payload, user: any) {
  if (!isOperator(user)) throw new ContentError("Staff access required", 403);
  const conversations = await all(p, "support-conversations", { overrideAccess: false, user });
  const ids = conversations.map((c) => c.id);
  const [runs, feedback, reviews, voice, calls, conversationMessages] = ids.length
    ? await Promise.all(
        [
          "support-runs",
          "support-feedback",
          "support-reviews",
          "support-voice-jobs",
          "support-calls",
          "support-messages",
        ].map((collection) =>
          all(p, collection, { where: { conversation: { in: ids } }, overrideAccess: true }),
        ),
      )
    : [[], [], [], [], [], []];
  return {
    scope: isAdmin(user) ? "all" : "assigned",
    generatedAt: new Date().toISOString(),
    metrics: {
      ...summarizeOperations(conversations, runs, feedback, reviews),
      timings: conversationTimings(conversations, conversationMessages),
      voice: {
        jobs: voice.length,
        failed: voice.filter((r) => r.status === "failed").length,
        reservedTranscriptionSeconds: voice
          .filter((r) => r.kind === "transcribe")
          .reduce((n, r) => n + (r.reserved || 0), 0),
        reservedSynthesisCharacters: voice
          .filter((r) => r.kind === "synthesize")
          .reduce((n, r) => n + (r.reserved || 0), 0),
      },
      calls: {
        total: calls.length,
        active: calls.filter((c) => ["queued", "connecting", "active"].includes(c.state)).length,
        cleanupPending: calls.filter((c) => c.cleanupPending).length,
        reservedSeconds: calls.reduce((n, c) => n + (c.reservedSeconds || 0), 0),
      },
    },
    features: await supportFeatures(p),
    recentRuns: runs
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 50)
      .map((r) => ({
        id: r.id,
        conversation: relationID(r.conversation),
        status: r.status,
        model: r.model,
        reserved: r.reserved,
        usage: r.usage,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        error: r.error ? "任务未完成；请管理员检查任务记录" : null,
      })),
    feedback: feedback.slice(-50).map((r) => ({
      id: r.id,
      conversation: relationID(r.conversation),
      rating: r.rating,
      comment: r.comment,
    })),
    reviews: reviews.slice(-100).map((r) => ({
      id: r.id,
      conversation: relationID(r.conversation),
      category: r.category,
      note: r.note,
    })),
    ...(isAdmin(user)
      ? {
          retention: await (p as any).findGlobal({ slug: "support-settings", depth: 0 }),
          retentionAudits: (await all(p, "support-retention-audits", { sort: "-createdAt" }))
            .slice(0, 20)
            .map(({ id, kind, status, createdAt, executedAt, result }) => ({
              id,
              kind,
              status,
              createdAt,
              executedAt,
              result,
            })),
        }
      : {}),
  };
}
export type RetentionKind = "text" | "audio" | "transcript";
export type RetentionDelegate = {
  candidates: (
    p: Payload,
    conversationIDs: number[],
    cutoff: string,
    req: any,
  ) => Promise<number[]>;
  execute: (p: Payload, ids: number[], req: any) => Promise<void>;
};
const delegates: Partial<Record<RetentionKind, RetentionDelegate>> = {
  audio: {
    async candidates(p, conversationIDs, cutoff, req) {
      if (!conversationIDs.length) return [];
      return (
        await all(p, "support-voice-audio", {
          where: {
            and: [{ conversation: { in: conversationIDs } }, { createdAt: { less_than: cutoff } }],
          },
          req,
        })
      ).map((r) => r.id);
    },
    async execute(p, ids, req) {
      const db = p as any;
      for (const id of ids) {
        await db.update({
          collection: "support-messages",
          where: { voiceAudio: { equals: id } },
          data: { voiceAudio: null },
          req,
        });
        await db.update({
          collection: "support-voice-jobs",
          where: { audio: { equals: id } },
          data: { audio: null },
          req,
        });
        await db.delete({ collection: "support-voice-audio", id, req });
      }
    },
  },
  transcript: {
    async candidates(p, conversationIDs, cutoff, req) {
      if (!conversationIDs.length) return [];
      return (
        await all(p, "support-messages", {
          where: {
            and: [{ conversation: { in: conversationIDs } }, { createdAt: { less_than: cutoff } }],
          },
          req,
        })
      )
        .filter(
          (r) =>
            r.voiceTranscript ||
            (r.dedupe?.startsWith("call-summary:") &&
              r.text !== "[Content removed by retention policy]"),
        )
        .map((r) => r.id);
    },
    async execute(p, ids, req) {
      for (const id of ids) {
        const message = await p.findByID({ collection: "support-messages", id, depth: 0, req });
        await (p as any).update({
          collection: "support-messages",
          id,
          data: {
            voiceTranscript: null,
            ...(message.dedupe?.startsWith("call-summary:")
              ? { text: "[Content removed by retention policy]", citations: null }
              : {}),
          },
          req,
        });
      }
    },
  },
};
export function registerSupportRetention(
  kind: "audio" | "transcript",
  delegate: RetentionDelegate,
) {
  delegates[kind] = delegate;
}
async function eligibleConversations(p: Payload, cutoff: string, req: any) {
  const cs = await all(p, "support-conversations", {
    where: { and: [{ status: { equals: "resolved" } }, { updatedAt: { less_than: cutoff } }] },
    req,
  });
  const eligible: number[] = [];
  for (const c of cs) {
    const runs = await p.count({
      collection: "support-runs",
      where: {
        and: [{ conversation: { equals: c.id } }, { status: { in: ["queued", "running"] } }],
      },
      req,
    });
    if (runs.totalDocs) continue;
    const db = p as any;
    const voice = await db.count({
      collection: "support-voice-jobs",
      where: {
        and: [{ conversation: { equals: c.id } }, { status: { in: ["queued", "running"] } }],
      },
      req,
    });
    const calls = await db.count({
      collection: "support-calls",
      where: {
        and: [
          { conversation: { equals: c.id } },
          {
            or: [
              { state: { in: ["queued", "connecting", "active"] } },
              { cleanupPending: { equals: true } },
            ],
          },
        ],
      },
      req,
    });
    if (voice.totalDocs || calls.totalDocs) continue;
    // Preserve unresolved or unknown linked cases. Never cascade to inquiries.
    let active = false;
    for (const link of c.inquiryLinks || []) {
      const q = (
        await p.find({
          collection: "inquiries",
          where: { reference: { equals: link.reference } },
          limit: 1,
          depth: 0,
          req,
        })
      ).docs[0];
      if (!q || !["closed"].includes(q.status)) {
        active = true;
        break;
      }
    }
    if (!active) eligible.push(c.id);
  }
  return eligible;
}
async function retentionPlan(p: Payload, kind: RetentionKind, req: any) {
  const settings = await (p as any).findGlobal({ slug: "support-settings", depth: 0, req });
  const days = settings[`${kind}RetentionDays`];
  if (!Number.isInteger(days) || days < 1 || days > 3650)
    throw new ContentError("Configure retention days first", 409);
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const conversations = await eligibleConversations(p, cutoff, req);
  if (kind !== "text" && !delegates[kind])
    throw new ContentError("此类清理尚未配置安全处理器，未删除任何内容", 409);
  const ids =
    kind === "text"
      ? conversations
      : await delegates[kind]!.candidates(p, conversations, cutoff, req);
  return { ids, policy: { days, enabled: settings.retentionDeletionEnabled === true }, cutoff };
}
export async function retentionAction(p: Payload, user: any, input: any) {
  admin(user);
  if (!["text", "audio", "transcript"].includes(input.kind))
    throw new ContentError("Invalid retention kind");
  const kind = input.kind as RetentionKind;
  return supportTransaction(p, async (req) => {
    const db = p as any;
    if (input.action === "preview") {
      const plan = await retentionPlan(p, kind, req);
      const token = randomUUID();
      const expiresAt = new Date(Date.now() + 600000).toISOString();
      await db.create({
        collection: "support-retention-audits",
        data: {
          actor: user.id,
          kind,
          token,
          status: "preview",
          expiresAt,
          candidates: plan.ids,
          policy: plan.policy,
        },
        req,
      });
      return {
        token,
        kind,
        count: plan.ids.length,
        unit: kind === "text" ? "conversations" : "records",
        ids: plan.ids,
        cutoff: plan.cutoff,
        expiresAt,
        deletionEnabled: plan.policy.enabled,
      };
    }
    if (input.action !== "execute" || input.confirm !== "DELETE SUPPORT CONTENT")
      throw new ContentError("Explicit deletion confirmation required");
    const audit = (
      await db.find({
        collection: "support-retention-audits",
        where: { token: { equals: input.token } },
        limit: 1,
        req,
      })
    ).docs[0];
    if (!audit || relationID(audit.actor) !== user.id || audit.kind !== kind)
      throw new ContentError("Preview unavailable", 404);
    if (audit.status === "executed") return audit.result;
    if (Date.parse(audit.expiresAt) < Date.now())
      throw new ContentError("Preview expired; preview again", 409);
    const plan = await retentionPlan(p, kind, req);
    if (!plan.policy.enabled) throw new ContentError("Deletion is disabled", 403);
    if (plan.policy.days !== audit.policy.days)
      throw new ContentError("Retention policy changed; preview again", 409);
    const ids = (audit.candidates as number[]).filter((id) => plan.ids.includes(id));
    if (kind === "text") {
      for (const id of ids) {
        await db.update({
          collection: "support-messages",
          where: { conversation: { equals: id } },
          data: { text: "[Content removed by retention policy]", citations: null },
          req,
        }); // Local API update always replaces updatedAt, even when explicitly supplied.
        // This narrow adapter write preserves the activity clock while clearing only
        // retention-owned fields. Eligibility and this write share the support lock/transaction.
        const conversation = await p.findByID({
          collection: "support-conversations",
          id,
          depth: 0,
          req,
        });
        await p.db.updateOne({
          collection: "support-conversations",
          id,
          data: { summary: null, proposedRequest: null, updatedAt: conversation.updatedAt },
          req,
        });
        await db.update({
          collection: "support-runs",
          where: { conversation: { equals: id } },
          data: { error: null, task: null },
          req,
        });
        await db.update({
          collection: "support-voice-jobs",
          where: { conversation: { equals: id } },
          data: { error: null },
          req,
        });
        await db.update({
          collection: "support-feedback",
          where: { conversation: { equals: id } },
          data: { comment: null },
          req,
        });
        await db.update({
          collection: "support-reviews",
          where: { conversation: { equals: id } },
          data: { note: "[Content removed by retention policy]" },
          req,
        });
      }
    } else await delegates[kind]!.execute(p, ids, req);
    const result = {
      ok: true,
      kind,
      processed: ids.length,
      skipped: audit.candidates.length - ids.length,
    };
    await db.update({
      collection: "support-retention-audits",
      id: audit.id,
      data: { status: "executed", executedAt: new Date().toISOString(), result },
      req,
    });
    return result;
  });
}
