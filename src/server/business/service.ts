import { aiQuoteSendAllowed } from "../../lib/business-ai";
import { createHash } from "node:crypto";
import type { Payload } from "payload";
import { isOperator, isManager, relationID } from "../../cms/access";
import { validID } from "../../lib/support";
import { validateQuote, allowedTransition, canConfirmQuote, publicQuote } from "../../lib/business";
import { ContentError } from "../content/service";
import { keyOf } from "../support/service";
import { customerOwnsInquiry, customerLinkedInquiries } from "../customer/service";
import { enqueueWorkflowEvent } from "../workflow/service";
export async function businessTransaction<T>(p: Payload, fn: (req: any) => Promise<T>): Promise<T> {
  const id = await p.db.beginTransaction();
  if (!id) throw Error("Transaction required");
  try {
    await (p.db.sessions as any)[id].db.execute("SELECT pg_advisory_xact_lock(726281)");
    const result = await fn({ transactionID: id });
    await p.db.commitTransaction(id);
    return result;
  } catch (e) {
    await p.db.rollbackTransaction(id);
    throw e;
  }
}
export async function businessInquiry(p: Payload, user: any, id: unknown, req?: any) {
  if (!isOperator(user)) throw new ContentError("需要业务运营权限", 403);
  return p.findByID({
    collection: "inquiries",
    id: validID(id),
    overrideAccess: false,
    user,
    depth: 0,
    req,
  });
}
async function all(p: any, collection: string, where: any, req?: any) {
  return (await p.find({ collection, where, pagination: false, depth: 0, req })).docs;
}
const fingerprint = (input: any) =>
  createHash("sha256").update(JSON.stringify(input)).digest("hex");
function short(v: unknown, max = 4000) {
  if (typeof v !== "string" || v.trim().length > max) throw new ContentError("文字格式无效");
  return v.trim();
}
function reason(input: any) {
  const v = short(input.reason, 2000);
  if (!v) throw new ContentError("请填写操作原因或完成说明");
  return v;
}
async function caseRecord(p: any, id: unknown, req?: any) {
  return p.findByID({ collection: "service-cases", id: validID(id), depth: 0, req });
}
function staffQuote(q: any, user: any) {
  const result = { ...q };
  if (!isManager(user)) delete result.internalCostMinor;
  return result;
}
export async function businessRead(p: Payload, user: any, id?: unknown) {
  if (!isOperator(user)) throw new ContentError("需要业务运营权限", 403);
  const db = p as any;
  if (id) {
    const c = await caseRecord(db, id);
    const inquiry = await businessInquiry(p, user, relationID(c.inquiry));
    return {
      case: c,
      inquiry,
      quotes: (await all(db, "service-quotes", { serviceCase: { equals: c.id } })).map((q: any) =>
        staffQuote(q, user),
      ),
      events: await all(db, "service-events", { serviceCase: { equals: c.id } }),
      canCost: isManager(user),
    };
  }
  const qs = await p.find({
    collection: "inquiries",
    overrideAccess: false,
    user,
    limit: 200,
    sort: "-updatedAt",
    depth: 0,
  });
  const ids = qs.docs.map((q) => q.id);
  return {
    inquiries: qs.docs.map((q) => ({
      id: q.id,
      reference: q.reference,
      name: q.name,
      city: q.city,
      status: q.status,
      owner: relationID(q.owner),
    })),
    cases: ids.length ? await all(db, "service-cases", { inquiry: { in: ids } }) : [],
    canCost: isManager(user),
  };
}
async function emit(p: Payload, q: any, c: any, event: any, req: any) {
  if (
    !["create", "send", "confirm", "stage", "arrange", "summary", "withdraw"].includes(event.action)
  )
    return;
  await enqueueWorkflowEvent(
    p,
    {
      key: `business:${event.id}`,
      type:
        event.action === "send"
          ? "quote-sent"
          : event.action === "confirm"
            ? "quote-confirmed"
            : "case-stage",
      inquiry: q.id,
      recipient: relationID(q.owner),
      title: `服务单 #${c.id} · ${event.action}`,
      dueAt: event.action === "send" ? event.detail?.expiresAt : undefined,
    },
    req,
  );
}
export async function businessAction(p: Payload, user: any, input: any) {
  return businessTransaction(p, async (req) => {
    const db = p as any;
    user = await p.findByID({ collection: "staff", id: user.id, depth: 0, req });
    if (!isOperator(user)) throw new ContentError("需要业务运营权限", 403);
    const action = input.action;
    const inquiry = action === "create" ? await businessInquiry(p, user, input.inquiry, req) : null;
    let c = action === "create" ? null : await caseRecord(db, input.id, req);
    const q = inquiry || (await businessInquiry(p, user, relationID(c.inquiry), req));
    const key = `staff:${user.id}:${keyOf(input.key)}`;
    const hash = fingerprint(input);
    const prior = (await all(db, "service-events", { dedupe: { equals: key } }, req))[0];
    if (prior) {
      if (prior.detail?.fingerprint !== hash) throw new ContentError("请求编号已用于不同操作", 409);
      return { case: relationID(prior.serviceCase), duplicate: true };
    }
    if (action === "create") {
      const existing = (await all(db, "service-cases", { inquiry: { equals: q.id } }, req))[0];
      if (existing) return { case: existing.id, duplicate: true };
      const title = short(input.title, 200);
      if (!title) throw new ContentError("请填写服务单名称");
      c = await db.create({
        collection: "service-cases",
        data: { inquiry: q.id, title, stage: "received", revision: 1, customerSummary: "" },
        req,
      });
    } else if (input.revision !== c.revision)
      throw new ContentError("记录已经变更，请刷新后操作", 409);
    let detail: any = { fingerprint: hash };
    let change: any = {};
    if (action === "quote") {
      if (
        !["received", "discovery", "quoting", "awaiting-confirmation", "accepted"].includes(c.stage)
      )
        throw new ContentError("当前阶段不可创建报价", 409);
      let quote;
      try {
        quote = validateQuote(input.quote);
      } catch (e) {
        throw new ContentError((e as Error).message);
      }
      if (input.quote.internalCostMinor !== undefined && input.quote.internalCostMinor !== null) {
        if (!isManager(user)) throw new ContentError("内部成本仅主管可维护", 403);
        if (
          !Number.isSafeInteger(input.quote.internalCostMinor) ||
          input.quote.internalCostMinor < 0 ||
          input.quote.internalCostMinor > 1000000000
        )
          throw new ContentError("内部成本无效");
        quote = { ...quote, internalCostMinor: input.quote.internalCostMinor };
      }
      const old = await all(db, "service-quotes", { serviceCase: { equals: c.id } }, req);
      if (old.length >= 100) throw new ContentError("报价版本过多");
      const created = await db.create({
        collection: "service-quotes",
        data: {
          ...quote,
          serviceCase: c.id,
          dedupe: key,
          revision: old.reduce((n: number, v: any) => Math.max(n, v.revision), 0) + 1,
          status: "draft",
          createdBy: user.id,
        },
        req,
      });
      detail.quote = created.id;
    } else if (action === "send") {
      if (
        !["received", "discovery", "quoting", "awaiting-confirmation", "accepted"].includes(c.stage)
      )
        throw new ContentError("当前阶段不可发出报价", 409);
      const quote = await db.findByID({
        collection: "service-quotes",
        id: validID(input.quote),
        depth: 0,
        req,
      });
      if (relationID(quote.serviceCase) !== c.id || quote.status !== "draft")
        throw new ContentError("只能发出本服务单的草稿报价", 409);
      if (!aiQuoteSendAllowed(quote))
        throw new ContentError("AI 报价须经主管人工审核通过后才能发出", 409);
      try {
        validateQuote(quote);
      } catch (e) {
        throw new ContentError((e as Error).message);
      }
      for (const old of await all(
        db,
        "service-quotes",
        { and: [{ serviceCase: { equals: c.id } }, { status: { in: ["sent", "accepted"] } }] },
        req,
      ))
        await db.update({
          collection: "service-quotes",
          id: old.id,
          data: { status: "superseded" },
          req,
        });
      await db.update({
        collection: "service-quotes",
        id: quote.id,
        data: { status: "sent", sentAt: new Date().toISOString() },
        req,
      });
      change = {
        latestQuote: quote.id,
        acceptedQuote: null,
        stage: "awaiting-confirmation",
        resourceConfirmed: false,
        scheduledAt: null,
        publicArrangement: "",
        internalArrangement: "",
        provider: null,
      };
      detail = { ...detail, quote: quote.id, expiresAt: quote.expiresAt };
    } else if (action === "review") {
      if (!isManager(user)) throw new ContentError("仅主管可审核 AI 报价", 403);
      const quote = await db.findByID({
        collection: "service-quotes",
        id: validID(input.quote),
        depth: 0,
        req,
      });
      if (
        relationID(quote.serviceCase) !== c.id ||
        quote.status !== "draft" ||
        !quote.aiTask ||
        quote.reviewStatus !== "pending"
      )
        throw new ContentError("此 AI 草稿当前不可审核", 409);
      if (!["approved", "rejected"].includes(input.decision))
        throw new ContentError("请选择审核结果");
      const note = reason(input);
      await db.update({
        collection: "service-quotes",
        id: quote.id,
        data: {
          reviewStatus: input.decision,
          reviewedBy: user.id,
          reviewedAt: new Date().toISOString(),
          reviewReason: note,
        },
        req,
      });
      detail = { ...detail, quote: quote.id, decision: input.decision, reason: note };
    } else if (action === "withdraw") {
      const quote = await db.findByID({
        collection: "service-quotes",
        id: validID(input.quote),
        depth: 0,
        req,
      });
      if (relationID(quote.serviceCase) !== c.id || !["draft", "sent"].includes(quote.status))
        throw new ContentError("报价当前不可撤回", 409);
      detail.reason = reason(input);
      await db.update({
        collection: "service-quotes",
        id: quote.id,
        data: { status: "withdrawn" },
        req,
      });
      if (relationID(c.latestQuote) === quote.id) change = { latestQuote: null, stage: "quoting" };
      detail.quote = quote.id;
    } else if (action === "arrange") {
      if (!["accepted", "scheduled"].includes(c.stage) || !c.acceptedQuote)
        throw new ContentError("客户确认方案后才能安排", 409);
      const at = Date.parse(input.scheduledAt);
      const pub = short(input.publicArrangement),
        internal = short(input.internalArrangement || "");
      if (!Number.isFinite(at) || !pub || input.resourceConfirmed !== true)
        throw new ContentError("请确认实际资源，并填写时间及对客安排");
      let provider: null | number = null;
      if (input.provider) {
        const v = await p.findByID({
          collection: "providers",
          id: validID(input.provider),
          depth: 0,
          overrideAccess: false,
          user,
          req,
        });
        if (!["verified", "contracted"].includes(v.status))
          throw new ContentError("服务商须已核实或签约");
        provider = v.id;
      }
      change = {
        scheduledAt: new Date(at).toISOString(),
        publicArrangement: pub,
        internalArrangement: internal,
        resourceConfirmed: true,
        provider,
      };
    } else if (action === "stage") {
      const target = input.stage;
      detail.reason = reason(input);
      if (
        !allowedTransition(
          c.stage,
          target,
          !!c.acceptedQuote,
          c.resourceConfirmed === true && !!c.scheduledAt && !!c.publicArrangement,
        )
      )
        throw new ContentError("当前状态不能进入该阶段，或尚未确认方案和资源", 409);
      if (["scheduled", "in-service"].includes(target) && c.provider) {
        const provider = await p.findByID({
          collection: "providers",
          id: relationID(c.provider)!,
          depth: 0,
          req,
        });
        if (!["verified", "contracted"].includes(provider.status))
          throw new ContentError("履约服务商已暂停或失效");
      }
      change = { stage: target };
      if (target === "completed") change.completedAt = new Date().toISOString();
      if (["quoting", "discovery", "cancelled", "paused"].includes(target)) {
        change.resourceConfirmed = false;
        if (c.latestQuote) {
          const quote = await db.findByID({
            collection: "service-quotes",
            id: relationID(c.latestQuote),
            req,
          });
          if (quote.status === "sent")
            await db.update({
              collection: "service-quotes",
              id: quote.id,
              data: { status: "withdrawn" },
              req,
            });
        }
        if (["quoting", "discovery", "cancelled"].includes(target)) {
          change.latestQuote = null;
          change.acceptedQuote = null;
        }
      }
    } else if (action === "summary") {
      change = { customerSummary: short(input.customerSummary) };
    } else if (action !== "create") throw new ContentError("未知业务操作");
    if (action !== "create")
      c = await db.update({
        collection: "service-cases",
        id: c.id,
        data: { ...change, revision: c.revision + 1 },
        req,
      });
    const event = await db.create({
      collection: "service-events",
      data: {
        serviceCase: c.id,
        dedupe: key,
        action,
        actor: user.id,
        detail,
        reason: detail.reason,
      },
      req,
    });
    await emit(p, q, c, event, req);
    return { case: c.id };
  });
}
export async function customerBusinessRead(p: Payload, customer: any) {
  return businessTransaction(p, async (req) => {
    const db = p as any;
    const inquiries = await customerLinkedInquiries(p, customer, req);
    const ids = inquiries.map((q: any) => (typeof q === "object" ? q.id : q));
    const cases = [];
    for (const c of ids.length
      ? await all(db, "service-cases", { inquiry: { in: ids } }, req)
      : []) {
      await customerOwnsInquiry(p, customer, relationID(c.inquiry), req);
      const q = await p.findByID({
        collection: "inquiries",
        id: relationID(c.inquiry)!,
        depth: 0,
        req,
      });
      cases.push({
        id: c.id,
        inquiry: q.id,
        reference: q.reference,
        title: c.title,
        stage: c.stage,
        revision: c.revision,
        customerSummary: c.customerSummary || "",
        scheduledAt: c.resourceConfirmed ? c.scheduledAt || null : null,
        publicArrangement: c.resourceConfirmed ? c.publicArrangement || "" : "",
        latestQuote: relationID(c.latestQuote) || null,
        quotes: (
          await all(
            db,
            "service-quotes",
            {
              and: [
                { serviceCase: { equals: c.id } },
                { status: { not_equals: "draft" } },
                { sentAt: { exists: true } },
              ],
            },
            req,
          )
        ).map(publicQuote),
      });
    }
    return { cases };
  });
}
export async function confirmQuote(p: Payload, customer: any, input: any) {
  return businessTransaction(p, async (req) => {
    const db = p as any;
    const quote = await db.findByID({
      collection: "service-quotes",
      id: validID(input.quote),
      depth: 0,
      req,
    });
    const c = await caseRecord(db, relationID(quote.serviceCase), req);
    await customerOwnsInquiry(p, customer, relationID(c.inquiry), req);
    const key = `customer:${customer.id}:${keyOf(input.key)}`;
    const prior = (await all(db, "service-events", { dedupe: { equals: key } }, req))[0];
    if (prior) {
      if (prior.action !== "confirm" || prior.detail?.quote !== quote.id)
        throw new ContentError("请求编号冲突", 409);
      return { case: c.id, quote: quote.id, duplicate: true };
    }
    if (
      quote.status === "accepted" &&
      relationID(quote.confirmedBy) === customer.id &&
      relationID(c.acceptedQuote) === quote.id
    )
      return { case: c.id, quote: quote.id, duplicate: true };
    if (c.stage !== "awaiting-confirmation" || !canConfirmQuote(quote, relationID(c.latestQuote)))
      throw new ContentError("此报价已过期、撤回或被新版替代，请联系华伴", 409);
    await db.update({
      collection: "service-quotes",
      id: quote.id,
      data: { status: "accepted", confirmedAt: new Date().toISOString(), confirmedBy: customer.id },
      req,
    });
    await db.update({
      collection: "service-cases",
      id: c.id,
      data: {
        stage: "accepted",
        acceptedQuote: quote.id,
        revision: c.revision + 1,
        resourceConfirmed: false,
      },
      req,
    });
    const event = await db.create({
      collection: "service-events",
      data: {
        serviceCase: c.id,
        dedupe: key,
        action: "confirm",
        customer: customer.id,
        detail: { quote: quote.id, revision: quote.revision },
      },
      req,
    });
    const q = await p.findByID({
      collection: "inquiries",
      id: relationID(c.inquiry)!,
      depth: 0,
      req,
    });
    await emit(p, q, c, event, req);
    return { case: c.id, quote: quote.id };
  });
}
