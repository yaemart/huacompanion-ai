import { createHash } from "node:crypto";
import type { Payload, PayloadRequest, CollectionSlug, Where } from "payload";
import type {
  Inquiry,
  ServiceCase,
  ServiceQuote,
  ServiceEvent,
  ServiceQuoteLineCost,
} from "../../../payload-types";
import type { Staff } from "../../cms/access";
import type { CustomerIdentity } from "../customer/service";
import { transactionSession } from "../db-types";
import { inquiryCaseID } from "../../lib/intake-case";
import {
  confirmsQuoteLines,
  quoteApproval,
  quoteReviewProof,
  quoteReviewState,
  type QuoteReviewDetail,
} from "./quote-review";
import { prepareQuoteLines, quoteLineOptions, quoteLineReviewRequirements } from "./quote-lines";
import { quoteLinesView } from "../../lib/quote-lines";
import {
  quoteTemplates,
  templatesForCategories,
  type QuoteTemplate,
} from "../../lib/quote-templates";
type BusinessEventDetail = QuoteReviewDetail & {
  fingerprint?: string;
  expiresAt?: string;
  reason?: string;
  revision?: number;
  collectionLines?: { lineId: string; reason: string; note: string }[];
};
type QuoteDraft = Pick<
  ServiceQuote,
  | "title"
  | "scope"
  | "included"
  | "excluded"
  | "terms"
  | "currency"
  | "lines"
  | "lineFormat"
  | "totalMinor"
  | "expiresAt"
  | "internalCostMinor"
>;
interface BusinessActionInput {
  action: string;
  id?: unknown;
  inquiry?: unknown;
  key?: unknown;
  revision?: unknown;
  title?: unknown;
  reason?: unknown;
  quote?: unknown;
  decision?: string;
  selfReview?: boolean;
  quoteUpdatedAt?: unknown;
  confirmations?: unknown;
  scheduledAt?: string;
  publicArrangement?: unknown;
  internalArrangement?: unknown;
  resourceConfirmed?: unknown;
  provider?: unknown;
  stage?: string;
  customerSummary?: unknown;
}
interface QuoteConfirmationInput {
  quote?: unknown;
  key?: unknown;
}

import { isOperator, isManager, isAdmin, relationID } from "../../cms/access";
import { validID } from "../../lib/support";
import { validateQuote, allowedTransition, canConfirmQuote, publicQuote } from "../../lib/business";
import { ContentError } from "../content/service";
import { keyOf } from "../support/service";
import { customerOwnsInquiry, customerLinkedInquiries } from "../customer/service";
import { enqueueWorkflowEvent } from "../workflow/service";
export async function businessTransaction<T>(
  p: Payload,
  fn: (req: Partial<PayloadRequest>) => Promise<T>,
): Promise<T> {
  const id = await p.db.beginTransaction();
  if (!id) throw Error("Transaction required");
  try {
    await transactionSession(p, id).db.execute("SELECT pg_advisory_xact_lock(726281)");
    const result = await fn({ transactionID: id });
    await p.db.commitTransaction(id);
    return result;
  } catch (e) {
    await p.db.rollbackTransaction(id);
    throw e;
  }
}
export async function businessInquiry(
  p: Payload,
  user: NonNullable<Staff>,
  id: unknown,
  req?: Partial<PayloadRequest>,
) {
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
export async function businessCaseForInquiry(p: Payload, user: NonNullable<Staff>, value: unknown) {
  const id = inquiryCaseID(value);
  if (!id) throw new ContentError("咨询编号无效");
  return businessTransaction(p, async (req) => {
    const actor = await p.findByID({ collection: "staff", id: user.id, depth: 0, req });
    await businessInquiry(p, actor, id, req).catch((e: unknown) => {
      if ([403, 404].includes((e as { status: number }).status))
        throw new ContentError("无权处理这条咨询，或咨询不存在", 403);
      throw e;
    });
    const result = await p.find({
      collection: "service-cases",
      where: { inquiry: { equals: id } },
      limit: 1,
      depth: 0,
      req,
    });
    return { case: result.docs[0]?.id ?? null };
  });
}
async function all<TSlug extends CollectionSlug>(
  p: Payload,
  collection: TSlug,
  where: Where,
  req?: Partial<PayloadRequest>,
) {
  return (await p.find({ collection, where, pagination: false, depth: 0, req })).docs;
}
const fingerprint = (input: unknown) =>
  createHash("sha256").update(JSON.stringify(input)).digest("hex");
function short(v: unknown, max = 4000) {
  if (typeof v !== "string" || v.trim().length > max) throw new ContentError("文字格式无效");
  return v.trim();
}
function reason(input: Pick<BusinessActionInput, "reason">) {
  const v = short(input.reason, 2000);
  if (!v) throw new ContentError("请填写操作原因或完成说明");
  return v;
}
function checkedQuote(input: unknown) {
  try {
    return validateQuote(input);
  } catch (e) {
    throw new ContentError((e as Error).message);
  }
}
async function caseRecord(p: Payload, id: unknown, req?: Partial<PayloadRequest>) {
  return p.findByID({ collection: "service-cases", id: validID(id), depth: 0, req });
}
function staffQuote(
  q: ServiceQuote,
  user: NonNullable<Staff>,
  events: ServiceEvent[],
  costs?: ServiceQuoteLineCost[],
) {
  const result = { ...q };
  if (!isManager(user)) delete result.internalCostMinor;
  const isAuthor = relationID(q.createdBy) === user.id;
  return {
    ...result,
    lines: quoteLinesView(q.lines, q.lineFormat, true),
    ...(costs && q.lineFormat === 2
      ? {
          lineCosts: costs
            .filter(({ quote }) => relationID(quote) === q.id)
            .map(({ lineId, costMinor }) => ({ lineId, costMinor })),
        }
      : {}),
    review: {
      state: quoteReviewState(q, events),
      isAuthor,
      canReview: isManager(user) && (!isAuthor || isAdmin(user)),
    },
  };
}
export type StaffQuote = ReturnType<typeof staffQuote>;
type BusinessDetail = {
  case: ServiceCase;
  inquiry: Inquiry;
  quotes: StaffQuote[];
  events: ServiceEvent[];
  canCost: boolean;
  quoteLineOptions: Awaited<ReturnType<typeof quoteLineOptions>>;
  quoteTemplates: QuoteTemplate[];
  features: { customerCenter: boolean };
};
type BusinessList = {
  inquiries: (Pick<Inquiry, "id" | "reference" | "name" | "city" | "status"> & {
    owner: ReturnType<typeof relationID>;
  })[];
  cases: ServiceCase[];
  canCost: boolean;
};
export function businessRead(
  p: Payload,
  user: NonNullable<Staff>,
  id: string | number,
): Promise<BusinessDetail>;
export function businessRead(p: Payload, user: NonNullable<Staff>): Promise<BusinessList>;
export function businessRead(
  p: Payload,
  user: NonNullable<Staff>,
  id?: unknown,
): Promise<BusinessDetail | BusinessList>;
export async function businessRead(
  p: Payload,
  user: NonNullable<Staff>,
  id?: unknown,
): Promise<BusinessDetail | BusinessList> {
  if (!isOperator(user)) throw new ContentError("需要业务运营权限", 403);
  const db = p;
  if (id) {
    user = await db.findByID({ collection: "staff", id: user.id, depth: 0 });
    const c = await caseRecord(db, id);
    const inquiry = await businessInquiry(p, user, relationID(c.inquiry));
    const [settings, customer, events, quotes, lineOptions] = await Promise.all([
      p.findGlobal({ slug: "quote-template-settings", depth: 0 }),
      p.findGlobal({ slug: "customer-settings", depth: 0 }).catch(() => undefined),
      all(db, "service-events", { serviceCase: { equals: c.id } }),
      all(db, "service-quotes", { serviceCase: { equals: c.id } }),
      quoteLineOptions(p, user),
    ]);
    const ids = quotes.filter((q) => q.lineFormat === 2).map((q) => q.id);
    const costs =
      isManager(user) && ids.length
        ? await all(db, "service-quote-line-costs", { quote: { in: ids } })
        : undefined;
    return {
      case: c,
      inquiry,
      quotes: quotes.map((q) => staffQuote(q, user, events, costs)),
      events: events.map((event) => {
        const detail = { ...(event.detail as BusinessEventDetail) };
        delete detail.fingerprint;
        return { ...event, detail };
      }),
      quoteLineOptions: lineOptions,
      canCost: isManager(user),
      features: {
        customerCenter: customer?.enabled === true,
      },
      quoteTemplates: templatesForCategories(
        quoteTemplates(settings.templates),
        inquiry.categories,
      ),
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
async function emit(
  p: Payload,
  q: Inquiry,
  c: ServiceCase,
  event: ServiceEvent,
  req: Partial<PayloadRequest>,
) {
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
      dueAt:
        event.action === "send"
          ? (event.detail as BusinessEventDetail | null)?.expiresAt
          : undefined,
    },
    req,
  );
}
export async function businessAction(
  p: Payload,
  user: NonNullable<Staff>,
  input: BusinessActionInput,
) {
  return businessTransaction(p, async (req) => {
    const db = p;
    const actor = await p.findByID({ collection: "staff", id: user.id, depth: 0, req });
    if (!isOperator(actor)) throw new ContentError("需要业务运营权限", 403);
    const action = input.action;
    const inquiry =
      action === "create" ? await businessInquiry(p, actor, input.inquiry, req) : null;
    let c = action === "create" ? null : await caseRecord(db, input.id, req);
    const q = inquiry || (await businessInquiry(p, actor, relationID(c!.inquiry), req));
    const quoteInput = input.quote as (QuoteDraft & { lineCosts?: unknown }) | undefined;
    if (action === "quote" && !isManager(actor)) {
      if (quoteInput?.internalCostMinor != null || quoteInput?.lineCosts !== undefined)
        throw new ContentError("内部成本仅主管或管理员可维护", 403);
    }
    const key = `staff:${actor.id}:${keyOf(input.key)}`;
    const hash = fingerprint(input);
    const prior = (await all(db, "service-events", { dedupe: { equals: key } }, req))[0];
    if (prior) {
      if ((prior.detail as BusinessEventDetail | null)?.fingerprint !== hash)
        throw new ContentError("请求编号已用于不同操作", 409);
      return { case: relationID(prior.serviceCase) as ServiceCase["id"], duplicate: true };
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
    } else if (input.revision !== c!.revision)
      throw new ContentError("记录已经变更，请刷新后操作", 409);
    let detail: BusinessEventDetail = { fingerprint: hash };
    let change: Partial<ServiceCase> = {};
    if (action === "quote") {
      if (
        !["received", "discovery", "quoting", "awaiting-confirmation", "accepted"].includes(
          c!.stage,
        )
      )
        throw new ContentError("当前阶段不可创建报价", 409);
      const checked = checkedQuote(input.quote);
      const split = await prepareQuoteLines(db, actor, req, input.quote, checked.lines);
      let quote: QuoteDraft = split ? { ...checked, lines: split.lines, lineFormat: 2 } : checked;
      if (quoteInput?.internalCostMinor != null) {
        if (
          !Number.isSafeInteger(quoteInput.internalCostMinor) ||
          quoteInput.internalCostMinor < 0 ||
          quoteInput.internalCostMinor > 1000000000
        )
          throw new ContentError("内部成本无效");
        quote = { ...quote, internalCostMinor: quoteInput.internalCostMinor };
      }
      const old = await all(db, "service-quotes", { serviceCase: { equals: c!.id } }, req);
      if (old.length >= 100) throw new ContentError("报价版本过多");
      const created = await db.create({
        collection: "service-quotes",
        data: {
          ...quote,
          serviceCase: c!.id,
          dedupe: key,
          revision: old.reduce((n: number, v) => Math.max(n, v.revision), 0) + 1,
          status: "draft",
          createdBy: actor.id,
        },
        req,
      });
      for (const cost of split?.lineCosts ?? [])
        await db.create({
          collection: "service-quote-line-costs",
          data: { ...cost, quote: created.id },
          req,
        });
      detail.quote = created.id;
      const collectionLines = split?.lines.flatMap(({ lineId, collection }) =>
        collection ? [{ lineId, ...collection }] : [],
      );
      if (collectionLines?.length) detail.collectionLines = collectionLines;
    } else if (action === "submit-review" || action === "review" || action === "send") {
      if (action === "review" && !isManager(actor))
        throw new ContentError("仅主管或管理员可审核报价", 403);
      const quote = await db.findByID({
        collection: "service-quotes",
        id: validID(input.quote),
        depth: 0,
        req,
      });
      if (relationID(quote.serviceCase) !== c!.id || quote.status !== "draft")
        throw new ContentError("只能操作本服务单的草稿报价", 409);
      detail.quote = quote.id;
      const reviews = await all(
        db,
        "service-events",
        { serviceCase: { equals: c!.id }, action: { equals: "review" } },
        req,
      );
      const state = quoteReviewState(quote, reviews);
      if (action === "submit-review") {
        if (state !== "unsubmitted")
          throw new ContentError("此版本已送审；退回后请另存新版本", 409);
        checkedQuote(quote);
        await quoteLineReviewRequirements(p, actor, req, quote);
        await db.update({
          collection: "service-quotes",
          id: quote.id,
          data: { reviewStatus: "pending", reviewedBy: null, reviewedAt: null, reviewReason: null },
          req,
        });
      } else if (action === "review") {
        const selfReview = relationID(quote.createdBy) === actor.id;
        if (selfReview && (!isAdmin(actor) || input.selfReview !== true))
          throw new ContentError("起草人不能审核自己的报价；管理员例外须明确确认并写明原因", 403);
        if (state !== "pending") throw new ContentError("此草稿当前不在待审核状态", 409);
        if (input.quoteUpdatedAt !== quote.updatedAt)
          throw new ContentError("报价已变更，请刷新后核对当前版本再审核", 409);
        const decision = input.decision;
        if (decision !== "approved" && decision !== "rejected")
          throw new ContentError("请选择审核结果");
        const note = reason(input);
        if (decision === "approved") {
          checkedQuote(quote);
          const required = await quoteLineReviewRequirements(p, actor, req, quote);
          if (required && !confirmsQuoteLines(input.confirmations, required))
            throw new ContentError("请逐项确认签约收款主体差异和华伴代收");
          detail.confirmations = required;
        }
        const reviewedAt = new Date().toISOString();
        const reviewed = await db.update({
          collection: "service-quotes",
          id: quote.id,
          data: { reviewStatus: decision, reviewedBy: actor.id, reviewedAt, reviewReason: note },
          req,
        });
        detail = {
          ...detail,
          ...quoteReviewProof(quote),
          decision,
          reason: note,
          reviewedAt,
          quoteUpdatedAt: reviewed.updatedAt,
          selfReview,
        };
      } else {
        if (
          !["received", "discovery", "quoting", "awaiting-confirmation", "accepted"].includes(
            c!.stage,
          )
        )
          throw new ContentError("当前阶段不可发出报价", 409);
        if (state !== "approved")
          throw new ContentError("此报价版本须由有权限的第二人审核通过后才能发出", 409);
        checkedQuote(quote);
        const required = await quoteLineReviewRequirements(p, actor, req, quote);
        if (required && !confirmsQuoteLines(quoteApproval(quote, reviews)?.confirmations, required))
          throw new ContentError("此版本仍需逐项确认，请另存并重新审核", 409);
        for (const old of await all(
          db,
          "service-quotes",
          { and: [{ serviceCase: { equals: c!.id } }, { status: { in: ["sent", "accepted"] } }] },
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
        detail.expiresAt = quote.expiresAt;
      }
    } else if (action === "withdraw") {
      const quote = await db.findByID({
        collection: "service-quotes",
        id: validID(input.quote),
        depth: 0,
        req,
      });
      if (relationID(quote.serviceCase) !== c!.id || !["draft", "sent"].includes(quote.status))
        throw new ContentError("报价当前不可撤回", 409);
      detail.reason = reason(input);
      await db.update({
        collection: "service-quotes",
        id: quote.id,
        data: { status: "withdrawn" },
        req,
      });
      if (relationID(c!.latestQuote) === quote.id) change = { latestQuote: null, stage: "quoting" };
      detail.quote = quote.id;
    } else if (action === "arrange") {
      if (!["accepted", "scheduled"].includes(c!.stage) || !c!.acceptedQuote)
        throw new ContentError("客户确认方案后才能安排", 409);
      const at = Date.parse(input.scheduledAt!);
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
          user: actor,
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
      const target = input.stage!;
      detail.reason = reason(input);
      if (
        !allowedTransition(
          c!.stage,
          target,
          !!c!.acceptedQuote,
          c!.resourceConfirmed === true && !!c!.scheduledAt && !!c!.publicArrangement,
        )
      )
        throw new ContentError("当前状态不能进入该阶段，或尚未确认方案和资源", 409);
      if (["scheduled", "in-service"].includes(target) && c!.provider) {
        const provider = await p.findByID({
          collection: "providers",
          id: relationID(c!.provider)!,
          depth: 0,
          req,
        });
        if (!["verified", "contracted"].includes(provider.status))
          throw new ContentError("履约服务商已暂停或失效");
      }
      change = { stage: target as ServiceCase["stage"] };
      if (target === "completed") change.completedAt = new Date().toISOString();
      if (["quoting", "discovery", "cancelled", "paused"].includes(target)) {
        change.resourceConfirmed = false;
        if (c!.latestQuote) {
          const quote = await db.findByID({
            collection: "service-quotes",
            id: relationID(c!.latestQuote)!,
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
        id: c!.id,
        data: { ...change, revision: c!.revision + 1 },
        req,
      });
    const event = await db.create({
      collection: "service-events",
      data: {
        serviceCase: c!.id,
        dedupe: key,
        action,
        actor: actor.id,
        detail,
        reason: detail.reason,
      },
      req,
    });
    await emit(p, q, c!, event, req);
    return { case: c!.id };
  });
}
export async function customerBusinessRead(p: Payload, customer: CustomerIdentity) {
  return businessTransaction(p, async (req) => {
    const db = p;
    const inquiries = await customerLinkedInquiries(p, customer, req);
    const ids = inquiries;
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
export async function confirmQuote(
  p: Payload,
  customer: CustomerIdentity,
  input: QuoteConfirmationInput,
) {
  return businessTransaction(p, async (req) => {
    const db = p;
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
      if (
        prior.action !== "confirm" ||
        (prior.detail as BusinessEventDetail | null)?.quote !== quote.id
      )
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
    await emit(p, q, c!, event, req);
    return { case: c.id, quote: quote.id };
  });
}
