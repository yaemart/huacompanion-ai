import { intakeEnabled } from "../../lib/deployment";
import { supportFeatures, requireSupportFeature } from "./features";
import { supportAssignmentToken } from "../../cms/support/trusted";
import { createHash } from "node:crypto";
import type { Payload, PayloadRequest, RequiredDataFromCollectionSlug } from "payload";
import type { SupportConversation, SupportMessage, Inquiry } from "../../../payload-types";
import type { Staff } from "../../cms/access";
import { transactionSession, type SupportInquiryLink } from "../db-types";
type ConversationChange = Partial<SupportConversation>;
type MessageData = Omit<RequiredDataFromCollectionSlug<"support-messages">, "conversation">;
interface VisitorActionInput {
  action: string;
  id?: unknown;
  key?: unknown;
  locale?: unknown;
  topic?: string;
  aiConsent?: unknown;
  text?: unknown;
  payload?: { kind?: unknown; values: { name: string; email: string } };
}
interface StaffActionInput {
  action: string;
  id?: unknown;
  key?: unknown;
  revision?: unknown;
  text?: unknown;
  locale?: unknown;
  message?: unknown;
  at?: string | null;
  team?: unknown;
  owner?: unknown;
}
import { isOperator, isAdmin, isManager, relationID } from "../../cms/access";
import { validOwner } from "../../cms/staff-guards";
import { isLocale } from "../../lib/locales";
import {
  publicConversation,
  publicMessage,
  validateMessage,
  validID,
  supportText,
} from "../../lib/support";
import { ContentError } from "../content/service";
import { saveIntake } from "../intake";
export const modelConfigured = () => {
  try {
    return !!(
      process.env.SUPPORT_AI_KEY &&
      new URL(process.env.SUPPORT_AI_ENDPOINT || "").protocol === "https:" &&
      Number(process.env.SUPPORT_AI_DAILY_TOKENS) > 0
    );
  } catch {
    return false;
  }
};
export function keyOf(v: unknown) {
  if (typeof v !== "string" || !/^[a-zA-Z0-9-]{16,80}$/.test(v))
    throw new ContentError("Invalid request key");
  return v;
}
export async function supportTransaction<T>(
  p: Payload,
  fn: (req: Partial<PayloadRequest>) => Promise<T>,
): Promise<T> {
  const id = await p.db.beginTransaction();
  if (!id) throw Error("Transaction required");
  try {
    await transactionSession(p, id).db.execute("SELECT pg_advisory_xact_lock(726280)");
    const r = await fn({ transactionID: id });
    await p.db.commitTransaction(id);
    return r;
  } catch (e) {
    await p.db.rollbackTransaction(id);
    throw e;
  }
}
export async function owned(p: Payload, hash: string, id: unknown, req?: Partial<PayloadRequest>) {
  const c = await p.findByID({
    collection: "support-conversations",
    id: validID(id),
    depth: 0,
    overrideAccess: true,
    req,
  });
  if (c.visitorHash !== hash) throw new ContentError("Conversation unavailable", 404);
  return c;
}
export async function scoped(
  p: Payload,
  user: NonNullable<Staff>,
  id: unknown,
  req?: Partial<PayloadRequest>,
) {
  if (!isOperator(user) || (user.collection && user.collection !== "staff"))
    throw new ContentError("Staff access required", 403);
  return p.findByID({
    collection: "support-conversations",
    id: validID(id),
    depth: 0,
    overrideAccess: false,
    user,
    req,
  });
}
export async function messages(p: Payload, id: number, req?: Partial<PayloadRequest>) {
  return (
    await p.find({
      collection: "support-messages",
      where: { conversation: { equals: id } },
      limit: 1000,
      sort: "id",
      depth: 0,
      overrideAccess: true,
      req,
    })
  ).docs;
}
export async function append(
  p: Payload,
  c: { id: ReturnType<typeof relationID> },
  data: MessageData,
  req: Partial<PayloadRequest>,
) {
  return p.create({
    collection: "support-messages",
    data: { conversation: c.id as number, ...data },
    overrideAccess: true,
    req,
  });
}
export async function updateConversation(
  p: Payload,
  c: SupportConversation,
  data: ConversationChange,
  req: Partial<PayloadRequest>,
  aiChanged = false,
) {
  return p.update({
    collection: "support-conversations",
    id: c.id,
    data: {
      ...data,
      revision: c.revision + 1,
      aiRevision:
        (c.aiRevision || 1) +
        (aiChanged || ["mode", "locale", "aiConsent"].some((k) => k in data) ? 1 : 0),
    },
    overrideAccess: true,
    req,
  });
}
async function queue(p: Payload, c: SupportConversation, req: Partial<PayloadRequest>) {
  if (c.mode === "ai" && c.aiConsent && (await supportFeatures(p, req)).aiReception.available)
    await p.create({
      collection: "support-runs",
      data: {
        conversation: c.id,
        dedupe: `${c.id}:${c.aiRevision}`,
        revision: c.aiRevision,
        status: "queued",
      },
      req,
    });
}
async function cap(p: Payload, c: SupportConversation, req: Partial<PayloadRequest>) {
  const all = await messages(p, c.id, req);
  if (all.length >= 900)
    throw new ContentError("Conversation limit reached; start a new conversation", 429);
  const recent = all.filter(
    (m) => m.author === "customer" && Date.parse(m.createdAt) > Date.now() - 60000,
  );
  if (recent.length >= 12)
    throw new ContentError("Please wait before sending another message", 429);
}
type VisitorDetail = {
  conversation: ReturnType<typeof publicConversation<SupportConversation>>;
  messages: NonNullable<
    ReturnType<typeof publicMessage<import("../../../payload-types").SupportMessage>>
  >[];
  inquiries: {
    reference: string;
    status: import("../../../payload-types").Inquiry["status"];
    stage: import("../../../payload-types").Inquiry["coordinationStage"];
  }[];
  aiAvailable: boolean;
};
type VisitorList = {
  features: Awaited<ReturnType<typeof supportFeatures>>;
  conversations: ReturnType<typeof publicConversation<SupportConversation>>[];
  aiAvailable: boolean;
};
export function visitorRead(p: Payload, hash: string, id: string | number): Promise<VisitorDetail>;
export function visitorRead(p: Payload, hash: string): Promise<VisitorList>;
export function visitorRead(
  p: Payload,
  hash: string,
  id?: unknown,
): Promise<VisitorDetail | VisitorList>;
export async function visitorRead(p: Payload, hash: string, id?: unknown) {
  if (!id)
    return {
      features: await supportFeatures(p),
      conversations: (
        await p.find({
          collection: "support-conversations",
          where: { visitorHash: { equals: hash } },
          sort: "-updatedAt",
          limit: 100,
          depth: 0,
        })
      ).docs.map(publicConversation),
      aiAvailable: (await supportFeatures(p)).aiReception.available,
    };
  const c = await owned(p, hash, id);
  const inquiries = [];
  for (const link of (c.inquiryLinks as SupportInquiryLink[]) || []) {
    const q = (
      await p.find({
        collection: "inquiries",
        where: { reference: { equals: link.reference } },
        limit: 1,
        depth: 0,
      })
    ).docs[0];
    if (q) inquiries.push({ reference: q.reference, status: q.status, stage: q.coordinationStage });
  }
  return {
    conversation: publicConversation(c),
    messages: (await messages(p, c.id)).map(publicMessage).filter(Boolean),
    inquiries,
    aiAvailable: (await supportFeatures(p)).aiReception.available,
  };
}
export function visitorAction(
  p: Payload,
  hash: string,
  input: VisitorActionInput & { action: "start" },
): Promise<ReturnType<typeof publicConversation<SupportConversation>>>;
export function visitorAction(
  p: Payload,
  hash: string,
  input: VisitorActionInput & { action: "confirm" },
): ReturnType<typeof saveIntake>;
export function visitorAction(
  p: Payload,
  hash: string,
  input: VisitorActionInput,
): Promise<
  | ReturnType<typeof publicConversation<SupportConversation>>
  | Awaited<ReturnType<typeof saveIntake>>
  | { ok: boolean }
>;
export async function visitorAction(p: Payload, hash: string, input: VisitorActionInput) {
  if (!hash) throw new ContentError("Session required", 403);
  return supportTransaction(p, async (req) => {
    if (["start", "message", "confirm"].includes(input.action))
      await requireSupportFeature(p, "textChat", req);
    if (input.action === "start") {
      const startKey = createHash("sha256")
        .update(hash + ":" + keyOf(input.key))
        .digest("hex");
      const old = (
        await p.find({
          collection: "support-conversations",
          where: { startKey: { equals: startKey } },
          limit: 1,
          req,
        })
      ).docs[0];
      if (old) return publicConversation(old);
      if (
        !isLocale(input.locale) ||
        !["general", "business", "housekeeping"].includes(input.topic!)
      )
        throw new ContentError("Invalid conversation");
      const recent = await p.count({
        collection: "support-conversations",
        where: { createdAt: { greater_than: new Date(Date.now() - 600000).toISOString() } },
        req,
      });
      const own = await p.count({
        collection: "support-conversations",
        where: { visitorHash: { equals: hash } },
        req,
      });
      if (recent.totalDocs >= 100 || own.totalDocs >= 100)
        throw new ContentError("Conversation limit reached", 429);
      const c = await p.create({
        collection: "support-conversations",
        data: {
          visitorHash: hash,
          startKey,
          locale: input.locale,
          topic: input.topic!,
          aiConsent: input.aiConsent === true,
          consentAt: input.aiConsent === true ? new Date().toISOString() : null,
          mode:
            input.aiConsent === true && (await supportFeatures(p, req)).aiReception.available
              ? "ai"
              : "waiting",
          status: "open",
          revision: 1,
          aiRevision: 1,
        },
        req,
      });
      await append(
        p,
        c,
        {
          dedupe: `start:${c.id}`,
          author: "system",
          visibility: "public",
          text: supportText(c.locale, c.mode === "ai" ? "intro" : "unavailable"),
        },
        req,
      );
      return publicConversation(c);
    }
    const c = await owned(p, hash, input.id, req);
    if (input.action === "message") {
      const text = validateMessage(input.text);
      const dedupe = `visitor:${c.id}:${keyOf(input.key)}`;
      const old = (
        await p.find({
          collection: "support-messages",
          where: { dedupe: { equals: dedupe } },
          limit: 1,
          req,
        })
      ).docs[0];
      if (old) {
        if (old.text !== text) throw new ContentError("Request key conflict", 409);
        return { ok: true };
      }
      await cap(p, c, req);
      await append(p, c, { dedupe, author: "customer", visibility: "public", text }, req);
      const next = await updateConversation(p, c, { status: "open" }, req, true);
      await queue(p, next, req);
      return { ok: true };
    }
    if (input.action === "consent") {
      if (input.aiConsent !== true) throw new ContentError("Explicit consent required");
      await updateConversation(p, c, { aiConsent: true, consentAt: new Date().toISOString() }, req);
      return { ok: true };
    }
    if (input.action === "language") {
      if (!isLocale(input.locale)) throw new ContentError("Invalid language");
      const pending = await p.count({
        collection: "support-runs",
        where: {
          and: [
            { conversation: { equals: c.id } },
            { status: { in: ["queued", "running"] } },
            { revision: { equals: c.aiRevision } },
          ],
        },
        req,
      });
      const next = await updateConversation(p, c, { locale: input.locale }, req);
      if (pending.totalDocs) await queue(p, next, req);
      return { ok: true };
    }
    if (input.action === "handoff") {
      await updateConversation(
        p,
        c,
        { mode: c.mode === "human" ? "human" : "waiting", aiConsent: false, status: "open" },
        req,
      );
      return { ok: true };
    }
    if (input.action === "confirm") {
      if (!intakeEnabled(process.env))
        throw new ContentError("Intake is not enabled for this environment", 503);
      if (
        ((c.inquiryLinks as SupportInquiryLink[]) || []).length >= 20 &&
        !(c.inquiryLinks as SupportInquiryLink[]).some((l) => l.key === input.key)
      )
        throw new ContentError("Request limit reached", 429);
      if (input.payload?.kind !== "request")
        throw new ContentError("Only service requests may be linked");
      const key = keyOf(input.key);
      const digest = createHash("sha256").update(`${hash}:${c.id}:${key}`).digest("hex");
      const uuid = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
      const result = await saveIntake(input.payload, uuid);
      const links = (c.inquiryLinks as SupportInquiryLink[]) || [];
      if (!links.some((l) => l.reference === result.reference)) {
        const customer =
          c.customer ||
          (
            await p.create({
              collection: "support-customers",
              data: {
                name: input.payload!.values.name,
                email: input.payload!.values.email,
                locale: c.locale,
                verified: false,
              },
              req,
            })
          ).id;
        await updateConversation(
          p,
          c,
          {
            customer,
            inquiryLinks: [...links, { reference: result.reference, key }],
            status: "open",
            mode: c.mode === "human" ? "human" : "waiting",
          },
          req,
        );
        if (c.team) {
          const q = (
            await p.find({
              collection: "inquiries",
              where: { reference: { equals: result.reference } },
              limit: 1,
              depth: 0,
              req,
            })
          ).docs[0];
          if (q && !q.team)
            await p.update({
              collection: "inquiries",
              id: q.id,
              data: {
                team: relationID(c.team) as number,
                owner: (relationID(c.owner) as number) || null,
              },
              req,
              context: {
                supportAssignmentToken,
                reference: q.reference,
                team: c.team,
                owner: c.owner,
              },
            });
        }
        await append(
          p,
          c,
          {
            dedupe: `confirm:${c.id}:${result.reference}`,
            author: "system",
            visibility: "public",
            text: `${supportText(c.locale, "progress")}: ${result.reference}`,
          },
          req,
        );
      }
      return result;
    }
    throw new ContentError("Unknown action");
  });
}
type StaffDetail = {
  conversation: SupportConversation;
  messages: SupportMessage[];
  inquiries: Inquiry[];
};
type StaffList = {
  features: Awaited<ReturnType<typeof supportFeatures>>;
  conversations: SupportConversation[];
  teams: { id: number; name: string }[];
  staff: { id: number; name: string; team: ReturnType<typeof relationID> }[];
  user: { id: string | number; isAdmin: boolean; isManager: boolean };
};
export function staffRead(
  p: Payload,
  user: NonNullable<Staff>,
  id: string | number,
): Promise<StaffDetail>;
export function staffRead(p: Payload, user: NonNullable<Staff>): Promise<StaffList>;
export function staffRead(
  p: Payload,
  user: NonNullable<Staff>,
  id?: unknown,
): Promise<StaffDetail | StaffList>;
export async function staffRead(
  p: Payload,
  user: NonNullable<Staff>,
  id?: unknown,
): Promise<StaffDetail | StaffList> {
  if (!isOperator(user)) throw new ContentError("Staff access required", 403);
  if (id) {
    const c = await scoped(p, user, id);
    const inquiries = [];
    for (const l of (c.inquiryLinks as SupportInquiryLink[]) || []) {
      const found = await p.find({
        collection: "inquiries",
        where: { reference: { equals: l.reference } },
        overrideAccess: false,
        user,
        limit: 1,
        depth: 0,
      });
      if (found.docs[0]) inquiries.push(found.docs[0]);
    }
    return { conversation: c, messages: await messages(p, c.id), inquiries };
  }
  const [cs, teams, staff] = await Promise.all([
    p.find({
      collection: "support-conversations",
      overrideAccess: false,
      user,
      limit: 200,
      depth: 0,
      sort: "-updatedAt",
    }),
    p.find({ collection: "teams", overrideAccess: false, user, limit: 100, depth: 0 }),
    p.find({ collection: "staff", overrideAccess: false, user, limit: 200, depth: 0 }),
  ]);
  return {
    features: await supportFeatures(p),
    conversations: cs.docs,
    teams: teams.docs.map((t) => ({ id: t.id, name: t.name })),
    staff: staff.docs
      .filter((s) => validOwner(s, s.team))
      .map((s) => ({ id: s.id, name: s.name, team: relationID(s.team) })),
    user: { id: user.id, isAdmin: isAdmin(user), isManager: isManager(user) },
  };
}
export async function staffAction(p: Payload, user: NonNullable<Staff>, input: StaffActionInput) {
  return supportTransaction(p, async (req) => {
    const c = await scoped(p, user, input.id, req);
    // Retry public/internal replies safely even after revision advances.
    if (["reply", "note"].includes(input.action)) {
      const dedupe = `staff:${c.id}:${user.id}:${keyOf(input.key)}`;
      const old = (
        await p.find({
          collection: "support-messages",
          where: { dedupe: { equals: dedupe } },
          limit: 1,
          req,
        })
      ).docs[0];
      if (old) {
        if (
          old.text !== validateMessage(input.text) ||
          old.visibility !== (input.action === "note" ? "internal" : "public")
        )
          throw new ContentError("Request key conflict", 409);
        return { ok: true };
      }
    }
    if (c.revision !== input.revision)
      throw new ContentError("Conversation changed; refresh and retry", 409);
    let change: ConversationChange = {};
    if (["reply", "note"].includes(input.action)) {
      await append(
        p,
        c,
        {
          dedupe: `staff:${c.id}:${user.id}:${keyOf(input.key)}`,
          author: "staff",
          staff: user.id as number,
          visibility: input.action === "note" ? "internal" : "public",
          text: validateMessage(input.text),
        },
        req,
      );
      if (input.action === "reply") change = { mode: "human", status: "waiting-customer" };
    } else if (input.action === "translate") {
      await requireSupportFeature(p, "translation", req);
      if (!c.aiConsent || !modelConfigured())
        throw new ContentError("需要客户允许 AI 处理，并配置模型");
      if (!isLocale(input.locale)) throw new ContentError("Invalid translation language");
      const message = await p.findByID({
        collection: "support-messages",
        id: validID(input.message),
        depth: 0,
        req,
      });
      if (
        relationID(message.conversation) !== c.id ||
        message.visibility !== "public" ||
        message.author !== "customer"
      )
        throw new ContentError("仅翻译当前会话的客户公开消息");
      const dedupe = `translate:${c.id}:${message.id}:${input.locale}:${user.id}`;
      if (
        !(await p.count({ collection: "support-runs", where: { dedupe: { equals: dedupe } }, req }))
          .totalDocs
      )
        await p.create({
          collection: "support-runs",
          data: {
            conversation: c.id,
            dedupe,
            revision: c.aiRevision,
            status: "queued",
            task: { kind: "translate", message: message.id, locale: input.locale, actor: user.id },
          },
          req,
        });
      return { ok: true };
    } else if (input.action === "takeover") change = { mode: "human", status: "open" };
    else if (input.action === "resume") {
      await requireSupportFeature(p, "aiReception", req);
      if (!c.aiConsent || !modelConfigured())
        throw new ContentError("AI consent and configured model required");
      change = { mode: "ai", status: "open" };
    } else if (input.action === "resolve") change = { status: "resolved", mode: "human" };
    else if (input.action === "followup") {
      if (input.at && !Number.isFinite(Date.parse(input.at)))
        throw new ContentError("Invalid follow-up date");
      change = { nextFollowUp: input.at || null };
    } else if (input.action === "assign") {
      if (!isManager(user)) throw new ContentError("Manager required", 403);
      const team = input.team ? validID(input.team) : null;
      const owner = input.owner ? validID(input.owner) : null;
      if (!isAdmin(user) && String(team) !== String(relationID(user.team)))
        throw new ContentError("Own team only", 403);
      if (team) await p.findByID({ collection: "teams", id: team, req });
      if (owner) {
        const person = await p.findByID({ collection: "staff", id: owner, req, depth: 0 });
        if (!validOwner(person, team))
          throw new ContentError("Owner must be an active operator in the selected team");
      }
      change = { team, owner };
      // Unassigned inquiries from this authenticated conversation may be assigned with it.
      for (const l of (c.inquiryLinks as SupportInquiryLink[]) || []) {
        const q = (
          await p.find({
            collection: "inquiries",
            where: { reference: { equals: l.reference } },
            limit: 1,
            depth: 0,
            req,
          })
        ).docs[0];
        if (q && (!q.team || String(relationID(q.team)) === String(relationID(c.team))))
          await p.update({
            collection: "inquiries",
            id: q.id,
            data: { team, owner },
            user,
            req: { ...req, user: user as PayloadRequest["user"] },
            overrideAccess: true,
          });
      }
    } else throw new ContentError("Unknown action");
    const next = await updateConversation(p, c, change, req);
    if (!["reply", "note"].includes(input.action))
      await append(
        p,
        c,
        {
          dedupe: `event:${c.id}:${next.revision}`,
          author: "system",
          staff: user.id as number,
          visibility: "internal",
          text: JSON.stringify({ action: input.action, change }),
        },
        req,
      );
    return { ok: true };
  });
}
