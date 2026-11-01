import type { Payload, PayloadRequest } from "payload";
import type { CustomerAccount, CustomerSession } from "../../../payload-types";
import type { Staff } from "../../cms/access";
import { transactionSession, type SupportInquiryLink } from "../db-types";
export type CustomerIdentity = Pick<CustomerAccount, "id"> & {
  email?: string;
  customerSessionID?: CustomerSession["id"];
};
interface VerificationInput {
  email?: unknown;
  locale?: unknown;
  handle?: unknown;
  token?: unknown;
}
interface CustomerLinkInput {
  inquiryID: number | string;
  reason?: unknown;
  email?: unknown;
  conversationID?: number | string;
}
import { customerWorkflowRead, customerWorkflowMarkRead } from "../workflow/service";
import { randomBytes } from "node:crypto";
import { isLocale } from "../../lib/locales";
import { customerCopy } from "../../lib/customer-copy";
import {
  customerCookie,
  customerEmail,
  customerHash,
  customerTokenMatches,
  usableChallenge,
  usableCustomerSession,
  validCustomerToken,
} from "../../lib/customer";
import { relationID, isOperator } from "../../cms/access";
import { ContentError } from "../content/service";
import { configuredMailEnabled, sendConfiguredMail } from "../workflow/mail";
const fresh = () => randomBytes(32).toString("hex");
const now = () => new Date().toISOString();
export async function customerTransaction<T>(
  p: Payload,
  fn: (req: Partial<PayloadRequest>) => Promise<T>,
): Promise<T> {
  const id = await p.db.beginTransaction();
  if (!id) throw Error("Transaction required");
  try {
    await transactionSession(p, id).db.execute("SELECT pg_advisory_xact_lock(726281)");
    await transactionSession(p, id).db.execute("SELECT pg_advisory_xact_lock(726283)");
    const result = await fn({ transactionID: id });
    await p.db.commitTransaction(id);
    return result;
  } catch (e) {
    await p.db.rollbackTransaction(id);
    throw e;
  }
}
export async function customerAvailable(p: Payload) {
  return (
    !!(await p.findGlobal({ slug: "customer-settings", overrideAccess: true })).enabled &&
    configuredMailEnabled()
  );
}
export async function requestVerification(
  p: Payload,
  input: VerificationInput,
  mail = sendConfiguredMail,
) {
  if (!(await customerAvailable(p)))
    throw new ContentError("Customer verification is disabled until email is configured", 503);
  let email: string;
  try {
    email = customerEmail(input.email);
  } catch {
    throw new ContentError("Invalid email");
  }
  const token = fresh(),
    handle = fresh();
  const challenge = await customerTransaction(p, async (req) => {
    const since = new Date(Date.now() - 900000).toISOString();
    const [all, own] = await Promise.all([
      p.count({
        collection: "customer-challenges",
        where: { createdAt: { greater_than: since } },
        req,
      }),
      p.count({
        collection: "customer-challenges",
        where: { and: [{ email: { equals: email } }, { createdAt: { greater_than: since } }] },
        req,
      }),
    ]);
    if (all.totalDocs >= 100 || own.totalDocs >= 3) return null;
    return p.create({
      collection: "customer-challenges",
      data: {
        email,
        handle,
        tokenHash: customerHash(token),
        expiresAt: new Date(Date.now() + 600000).toISOString(),
        attempts: 0,
      },
      req,
    });
  });
  // Identical response for existing/new accounts and throttled email requests. Tokens never enter responses or logs.
  if (challenge) {
    let status = "failed";
    const copy = customerCopy(isLocale(input.locale) ? input.locale : "en");
    try {
      status = (
        await mail({
          to: email,
          subject: `Hua Companion · ${copy[4]}`,
          text: `${copy[4]}: ${token}\n${copy[8]}`,
          idempotencyKey: `customer-verification-${challenge.id}`,
        })
      ).status;
    } catch {}
    if (status !== "sent")
      await p.update({
        collection: "customer-challenges",
        id: challenge.id,
        data: { consumedAt: now() },
      });
  }
  return { ok: true, handle };
}
export async function verifyCustomer(p: Payload, input: VerificationInput) {
  if (!(await customerAvailable(p)))
    throw new ContentError("Customer verification is disabled", 503);
  if (!validCustomerToken(input.handle)) throw new ContentError("Verification failed", 401);
  const result = await customerTransaction(p, async (req) => {
    const c = (
      await p.find({
        collection: "customer-challenges",
        where: { handle: { equals: input.handle } },
        limit: 1,
        depth: 0,
        req,
      })
    ).docs[0];
    if (!usableChallenge(c)) return null;
    await p.update({
      collection: "customer-challenges",
      id: c.id,
      data: { attempts: c.attempts! + 1 },
      req,
    });
    if (!customerTokenMatches(input.token, c.tokenHash)) return null;
    await p.update({
      collection: "customer-challenges",
      id: c.id,
      data: { consumedAt: now() },
      req,
    });
    let customer = (
      await p.find({
        collection: "customer-accounts",
        where: { email: { equals: c.email } },
        limit: 1,
        depth: 0,
        req,
      })
    ).docs[0];
    if (customer?.active === false) return null;
    if (!customer)
      customer = await p.create({
        collection: "customer-accounts",
        data: { email: c.email, verifiedAt: now(), active: true },
        req,
      });
    const token = fresh();
    await p.create({
      collection: "customer-sessions",
      data: {
        customer: customer.id,
        tokenHash: customerHash(token),
        expiresAt: new Date(Date.now() + 86400000 * 7).toISOString(),
      },
      req,
    });
    return { token };
  });
  if (!result) throw new ContentError("Verification failed", 401);
  return result;
}
function cookieToken(headers: Headers) {
  return headers
    .get("cookie")
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(customerCookie + "="))
    ?.slice(customerCookie.length + 1);
}
export async function customerSession(p: Payload, headers: Headers) {
  if (!(await p.findGlobal({ slug: "customer-settings", overrideAccess: true })).enabled)
    throw new ContentError("Customer login required", 401);
  const token = cookieToken(headers);
  if (!validCustomerToken(token)) throw new ContentError("Customer login required", 401);
  const session = (
    await p.find({
      collection: "customer-sessions",
      where: { tokenHash: { equals: customerHash(token) } },
      limit: 1,
      depth: 0,
    })
  ).docs[0];
  if (!usableCustomerSession(session)) throw new ContentError("Customer login required", 401);
  const c = await p.findByID({
    collection: "customer-accounts",
    id: relationID(session.customer)!,
    depth: 0,
  });
  if (!c.active || !c.verifiedAt) throw new ContentError("Customer login required", 401);
  return { ...c, customerSessionID: session.id };
}
export async function logoutCustomer(p: Payload, headers: Headers) {
  return customerTransaction(p, async (req) => {
    const token = cookieToken(headers);
    if (validCustomerToken(token))
      await p.update({
        collection: "customer-sessions",
        where: { tokenHash: { equals: customerHash(token) } },
        data: { revokedAt: now() },
        req,
      });
    return { ok: true };
  });
}
export async function customerOwnsInquiry(
  p: Payload,
  customer: CustomerIdentity,
  inquiryID: number | string | undefined,
  req?: Partial<PayloadRequest>,
) {
  const denied = () => new ContentError("Inquiry unavailable", 404);
  if (
    !customer?.id ||
    !(await p.findGlobal({ slug: "customer-settings", overrideAccess: true, req })).enabled
  )
    throw denied();
  const c = await p
    .findByID({ collection: "customer-accounts", id: customer.id, depth: 0, req })
    .catch(() => null);
  if (!c?.active || !c.verifiedAt) throw denied();
  if (customer.customerSessionID) {
    const session = await p
      .findByID({ collection: "customer-sessions", id: customer.customerSessionID, depth: 0, req })
      .catch(() => null);
    if (!usableCustomerSession(session) || String(relationID(session.customer)) !== String(c.id))
      throw denied();
  }
  const link = (
    await p.find({
      collection: "customer-inquiry-links",
      where: {
        and: [
          { customer: { equals: c.id } },
          { inquiry: { equals: inquiryID } },
          { active: { equals: true } },
        ],
      },
      limit: 1,
      depth: 0,
      req,
    })
  ).docs[0];
  if (
    !link ||
    !(await p
      .findByID({ collection: "inquiries", id: inquiryID!, depth: 0, req })
      .catch(() => null))
  )
    throw denied();
  return true;
}
export async function linkCustomerInquiry(
  p: Payload,
  user: NonNullable<Staff>,
  input: CustomerLinkInput,
) {
  if (!isOperator(user)) throw new ContentError("Staff access required", 403);
  return customerTransaction(p, async (req) => {
    const actor = await p.findByID({ collection: "staff", id: user.id, depth: 0, req });
    if (!isOperator(actor)) throw new ContentError("Staff access required", 403);
    const inquiry = await p.findByID({
      collection: "inquiries",
      id: input.inquiryID,
      overrideAccess: false,
      user: actor,
      depth: 0,
      req,
    });
    const reason = typeof input.reason === "string" ? input.reason.trim() : "";
    if (reason.length < 10 || reason.length > 2000)
      throw new ContentError("Record the identity verification evidence (10–2000 characters)");
    const email = customerEmail(input.email);
    const c = (
      await p.find({
        collection: "customer-accounts",
        where: { email: { equals: email } },
        limit: 1,
        depth: 0,
        req,
      })
    ).docs[0];
    if (!c?.active || !c.verifiedAt)
      throw new ContentError("Customer must verify their email first");
    let conversation = null;
    if (input.conversationID) {
      conversation = await p.findByID({
        collection: "support-conversations",
        id: input.conversationID,
        overrideAccess: false,
        user: actor,
        depth: 0,
        req,
      });
      if (
        !((conversation.inquiryLinks as SupportInquiryLink[] | null) || []).some(
          (l) => l.reference === inquiry.reference,
        )
      )
        throw new ContentError("Conversation must belong to this inquiry");
    }
    const dedupe = `${c.id}:${inquiry.id}`;
    const existing = (
      await p.find({
        collection: "customer-inquiry-links",
        where: { dedupe: { equals: dedupe } },
        limit: 1,
        req,
      })
    ).docs[0];
    if (existing) throw new ContentError("Association already exists", 409);
    await p.create({
      collection: "customer-inquiry-links",
      data: {
        customer: c.id,
        inquiry: inquiry.id,
        conversation: conversation?.id,
        verifiedBy: actor.id,
        verificationReason: reason,
        verifiedAt: now(),
        active: true,
        dedupe,
      },
      req,
    });
    return { ok: true };
  });
}
export async function customerRead(p: Payload, customer: CustomerIdentity) {
  return customerTransaction(p, async (req) => {
    const links = (
      await p.find({
        collection: "customer-inquiry-links",
        where: { and: [{ customer: { equals: customer.id } }, { active: { equals: true } }] },
        limit: 100,
        depth: 0,
        req,
      })
    ).docs;
    const inquiries = [];
    const conversations = [];
    for (const l of links) {
      await customerOwnsInquiry(p, customer, relationID(l.inquiry), req);
      const q = await p.findByID({
        collection: "inquiries",
        id: relationID(l.inquiry)!,
        depth: 0,
        req,
      });
      inquiries.push({
        id: q.id,
        reference: q.reference,
        status: q.status,
        stage: q.coordinationStage,
      });
      if (l.conversation) {
        const c = await p
          .findByID({
            collection: "support-conversations",
            id: relationID(l.conversation)!,
            depth: 0,
            req,
          })
          .catch(() => null);
        if (
          c &&
          ((c.inquiryLinks as SupportInquiryLink[] | null) || []).some(
            (x) => x.reference === q.reference,
          )
        ) {
          const messages = (
            await p.find({
              collection: "support-messages",
              where: {
                and: [{ conversation: { equals: c.id } }, { visibility: { equals: "public" } }],
              },
              limit: 200,
              sort: "createdAt",
              depth: 0,
              req,
            })
          ).docs.map((m) => ({
            id: m.id,
            text: m.text,
            author: m.author,
            createdAt: m.createdAt,
          }));
          conversations.push({ id: c.id, messages });
        }
      }
    }
    return {
      email: customer.email,
      inquiries,
      conversations,
      notifications: await customerWorkflowRead(p, customer, req),
    };
  });
}
export async function customerLinkedInquiries(
  p: Payload,
  customer: CustomerIdentity,
  req?: Partial<PayloadRequest>,
) {
  const links = (
    await p.find({
      collection: "customer-inquiry-links",
      where: { and: [{ customer: { equals: customer.id } }, { active: { equals: true } }] },
      depth: 0,
      limit: 100,
      req,
    })
  ).docs;
  const ids = [];
  for (const l of links) {
    const id = relationID(l.inquiry);
    await customerOwnsInquiry(p, customer, id, req);
    ids.push(id);
  }
  return ids;
}
export async function revokeCustomerInquiry(
  p: Payload,
  user: NonNullable<Staff>,
  input: CustomerLinkInput,
) {
  if (!isOperator(user)) throw new ContentError("Staff access required", 403);
  return customerTransaction(p, async (req) => {
    const actor = await p.findByID({ collection: "staff", id: user.id, depth: 0, req });
    if (!isOperator(actor)) throw new ContentError("Staff access required", 403);
    await p.findByID({
      collection: "inquiries",
      id: input.inquiryID,
      overrideAccess: false,
      user: actor,
      depth: 0,
      req,
    });
    const reason = typeof input.reason === "string" ? input.reason.trim() : "";
    if (reason.length < 10 || reason.length > 2000)
      throw new ContentError("Record the reason (10–2000 characters)");
    const c = (
      await p.find({
        collection: "customer-accounts",
        where: { email: { equals: customerEmail(input.email) } },
        limit: 1,
        req,
      })
    ).docs[0];
    if (!c) throw new ContentError("Association unavailable", 404);
    const link = (
      await p.find({
        collection: "customer-inquiry-links",
        where: { dedupe: { equals: `${c.id}:${input.inquiryID}` } },
        limit: 1,
        req,
      })
    ).docs[0];
    if (!link) throw new ContentError("Association unavailable", 404);
    if (link.active)
      await p.update({
        collection: "customer-inquiry-links",
        id: link.id,
        data: { active: false, revokedBy: actor.id, revokedAt: now(), revocationReason: reason },
        req,
      });
    return { ok: true };
  });
}

export async function markCustomerNotification(
  p: Payload,
  customer: CustomerIdentity,
  id: unknown,
) {
  const notificationID = Number(id);
  if (!Number.isSafeInteger(notificationID) || notificationID < 1)
    throw new ContentError("Invalid notification");
  return customerTransaction(p, (req) =>
    customerWorkflowMarkRead(p, customer, notificationID, req),
  );
}
