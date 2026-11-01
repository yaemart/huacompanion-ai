import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import {
  requestVerification,
  verifyCustomer,
  customerSession,
  customerOwnsInquiry,
  customerLinkedInquiries,
  linkCustomerInquiry,
  revokeCustomerInquiry,
  logoutCustomer,
  customerRead,
} from "../../src/server/customer/service";
import { customerCookie, customerHash } from "../../src/lib/customer";
// Serial local PostgreSQL integration. A rollback-only outer transaction keeps fixtures/settings isolated.
// Every email call receives an in-memory adapter; network sends are never used.
if (
  process.env.APP_ENV !== "local" ||
  !process.env.DATABASE_URL?.includes("@127.0.0.1:55438/hua_companion")
)
  throw Error("Local fixture database required");
const p = await getPayload({ config });
const originalRollback = p.db.rollbackTransaction.bind(p.db);
const run = `customer-${randomUUID()}`;
let transactionID: any;
const envKeys = ["WORKFLOW_MAIL_ENABLED", "WORKFLOW_MAIL_API_KEY", "WORKFLOW_MAIL_FROM"];
const oldEnv = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]));
const originalSettings = await (p as any).findGlobal({ slug: "customer-settings" });
try {
  transactionID = await p.db.beginTransaction();
  assert.ok(transactionID);
  const req = { transactionID };
  // Payload killTransaction accesses req.payload.db directly on expected access errors.
  // Keep the outer transaction alive; each real operation has a savepoint below.
  p.db.rollbackTransaction = async (id) => {
    if (id !== transactionID) await originalRollback(id);
  };
  let operation = 0;
  let queue: Promise<any> = Promise.resolve();
  const transactionDB = new Proxy(p.db, {
    get(target, key) {
      if (key === "beginTransaction") return async () => transactionID;
      if (key === "commitTransaction" || key === "rollbackTransaction") return async () => {};
      const v = Reflect.get(target, key);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  // Keep service queries, including those outside its transaction helper, on the same real DB transaction.
  const methods = [
    "find",
    "findByID",
    "findGlobal",
    "count",
    "create",
    "update",
    "updateGlobal",
    "delete",
  ];
  const db: any = new Proxy(p, {
    get(target, key) {
      if (key === "db") return transactionDB;
      const v = Reflect.get(target, key);
      if (methods.includes(String(key)))
        return (args: any) => {
          const execute = async () => {
            const savepoint = `customer_test_${++operation}`;
            const sql = (p.db.sessions as any)[transactionID].db;
            await sql.execute(`SAVEPOINT ${savepoint}`);
            try {
              const result = await v.call(target, { ...args, req: { ...args.req, ...req } });
              await sql.execute(`RELEASE SAVEPOINT ${savepoint}`);
              return result;
            } catch (error) {
              await sql.execute(`ROLLBACK TO SAVEPOINT ${savepoint}`);
              await sql.execute(`RELEASE SAVEPOINT ${savepoint}`);
              throw error;
            }
          };
          const result = queue.then(execute);
          queue = result.catch(() => {});
          return result;
        };
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  const admin = (
    await db.find({
      collection: "staff",
      where: { and: [{ role: { equals: "admin" } }, { active: { not_equals: false } }] },
      limit: 1,
      depth: 0,
    })
  ).docs[0];
  assert.ok(admin);
  const actor = { ...admin, collection: "staff" };
  await db.updateGlobal({ slug: "customer-settings", data: { enabled: true } });
  process.env.WORKFLOW_MAIL_ENABLED = "false";
  await assert.rejects(
    () =>
      requestVerification(db, { email: `${run}@example.com` }, async () => {
        throw Error("Must not send");
      }),
    /disabled/,
  );
  process.env.WORKFLOW_MAIL_ENABLED = "true";
  process.env.WORKFLOW_MAIL_API_KEY = "fictional-test-key";
  process.env.WORKFLOW_MAIL_FROM = "fixture@example.com";
  let delivered = "";
  let sent = 0;
  const mail = async (message: any) => {
    sent++;
    delivered = message.text.match(/[a-f0-9]{64}/)[0];
    return { status: "sent" as const };
  };
  const email = `${run}@example.com`;
  const first = await requestVerification(db, { email }, mail);
  assert.equal(sent, 1);
  assert.equal(JSON.stringify(first).includes(delivered), false);
  const challenge = (
    await db.find({
      collection: "customer-challenges",
      where: { handle: { equals: first.handle } },
      limit: 1,
    })
  ).docs[0];
  assert.equal(challenge.tokenHash, customerHash(delivered));
  assert.notEqual(challenge.tokenHash, delivered);
  await assert.rejects(() => verifyCustomer(db, { handle: first.handle, token: "0".repeat(64) }));
  assert.equal(
    (await db.findByID({ collection: "customer-challenges", id: challenge.id })).attempts,
    1,
  );
  const session = await verifyCustomer(db, { handle: first.handle, token: delivered });
  await assert.rejects(
    () => verifyCustomer(db, { handle: first.handle, token: delivered }),
    "One-time verification must reject replay",
  );
  const headers = new Headers({ cookie: `${customerCookie}=${session.token}` });
  const customer = await customerSession(db, headers);
  assert.equal(customer.email, email);
  const q = await db.create({
    collection: "inquiries",
    data: {
      reference: run,
      requestKey: randomUUID(),
      contentHash: run,
      name: "Fictional customer",
      email,
      categories: ["business"],
      city: "Shanghai",
      status: "new",
    },
  });
  await assert.rejects(
    () => customerOwnsInquiry(db, customer, q.id),
    "Same email never grants access",
  );
  assert.deepEqual(await customerLinkedInquiries(db, customer), []);
  await assert.rejects(() =>
    linkCustomerInquiry(db, actor, { email, inquiryID: q.id, reason: "short" }),
  );
  const deniedActor = { ...actor, id: 999999, role: "operations", additionalRoles: [], team: null };
  await assert.rejects(() =>
    linkCustomerInquiry(db, deniedActor, {
      email,
      inquiryID: q.id,
      reason: "Fictional identity verification evidence",
    }),
  );
  const staleStaff = await db.create({
    collection: "staff",
    user: actor,
    overrideAccess: false,
    data: {
      name: run,
      email: `staff-${email}`,
      password: randomBytes(24).toString("hex"),
      role: "admin",
    },
  });
  const staleActor = { ...staleStaff, collection: "staff" };
  await db.update({
    collection: "staff",
    id: staleStaff.id,
    user: actor,
    overrideAccess: false,
    data: { active: false },
  });
  await assert.rejects(
    () =>
      linkCustomerInquiry(db, staleActor, {
        email,
        inquiryID: q.id,
        reason: "Fictional identity verification evidence",
      }),
    /Staff access required/,
  );
  await linkCustomerInquiry(db, actor, {
    email,
    inquiryID: q.id,
    reason: "Fictional identity checked with inquiry reference",
  });
  assert.equal(await customerOwnsInquiry(db, customer, q.id), true);
  assert.deepEqual(await customerLinkedInquiries(db, customer), [q.id]);
  const view = await customerRead(db, customer);
  assert.equal(view.inquiries.length, 1);
  assert.equal(JSON.stringify(view).includes("contentHash"), false);
  const outsider = await db.create({
    collection: "customer-accounts",
    data: { email: `other-${email}`, active: true, verifiedAt: new Date().toISOString() },
  });
  await assert.rejects(() => customerOwnsInquiry(db, outsider, q.id));
  const link = (
    await db.find({
      collection: "customer-inquiry-links",
      where: { customer: { equals: customer.id } },
      limit: 1,
    })
  ).docs[0];
  await assert.rejects(() =>
    db.findByID({
      collection: "customer-inquiry-links",
      id: link.id,
      overrideAccess: false,
      user: actor,
    }),
  );
  await db.updateGlobal({ slug: "customer-settings", data: { enabled: false } });
  await assert.rejects(() => customerSession(db, headers));
  await assert.rejects(() => customerOwnsInquiry(db, customer, q.id));
  await db.updateGlobal({ slug: "customer-settings", data: { enabled: true } });
  await logoutCustomer(db, headers);
  await assert.rejects(() => customerSession(db, headers));
  await assert.rejects(
    () => customerOwnsInquiry(db, customer, q.id),
    "Session revocation checked again within business operations",
  );
  const second = await requestVerification(db, { email }, mail);
  const secondSession = await verifyCustomer(db, { handle: second.handle, token: delivered });
  const secondCustomer = await customerSession(
    db,
    new Headers({ cookie: `${customerCookie}=${secondSession.token}` }),
  );
  assert.equal(secondCustomer.id, customer.id, "Cross-device verification uses same account");
  assert.equal(await customerOwnsInquiry(db, secondCustomer, q.id), true);
  await assert.rejects(
    () =>
      revokeCustomerInquiry(db, staleActor, {
        email,
        inquiryID: q.id,
        reason: "Fictional association revoked after rechecking",
      }),
    /Staff access required/,
  );
  assert.equal(await customerOwnsInquiry(db, secondCustomer, q.id), true);
  await revokeCustomerInquiry(db, actor, {
    email,
    inquiryID: q.id,
    reason: "Fictional association revoked after rechecking",
  });
  await assert.rejects(() => customerOwnsInquiry(db, secondCustomer, q.id));
  const exhausted = await requestVerification(db, { email: `exhausted-${email}` }, mail);
  const exhaustedToken = delivered;
  for (let i = 0; i < 5; i++)
    await assert.rejects(() =>
      verifyCustomer(db, { handle: exhausted.handle, token: "0".repeat(64) }),
    );
  await assert.rejects(() =>
    verifyCustomer(db, { handle: exhausted.handle, token: exhaustedToken }),
  );
  const expired = await requestVerification(db, { email: `expired-${email}` }, mail);
  const expiredToken = delivered;
  await db.update({
    collection: "customer-challenges",
    where: { handle: { equals: expired.handle } },
    data: { expiresAt: new Date(Date.now() - 1000).toISOString() },
  });
  await assert.rejects(() => verifyCustomer(db, { handle: expired.handle, token: expiredToken }));
  const rateEmail = `rate-${email}`;
  const before = sent;
  for (let i = 0; i < 4; i++)
    assert.equal((await requestVerification(db, { email: rateEmail }, mail)).ok, true);
  assert.equal(sent - before, 3, "Email send limit is persisted");
  const failed = await requestVerification(db, { email: `failed-${email}` }, async () => ({
    status: "failed",
  }));
  assert.ok(
    (
      await db.find({
        collection: "customer-challenges",
        where: { handle: { equals: failed.handle } },
        limit: 1,
      })
    ).docs[0].consumedAt,
  );
  p.db.rollbackTransaction = originalRollback;
  await originalRollback(transactionID);
  transactionID = undefined;
  assert.equal(
    (await (p as any).findGlobal({ slug: "customer-settings" })).enabled,
    originalSettings.enabled,
  );
  assert.equal(
    (
      await (p as any).count({
        collection: "customer-accounts",
        where: { email: { equals: email } },
      })
    ).totalDocs,
    0,
  );
  console.log(
    "PASS customer real DB: disabled mail, hashed secret, bounded attempts, expiry/replay, " +
      "session logout, no auto-link, scoped manual association, revocation, cross-device " +
      "identity, send cap and failed-mail invalidation",
  );
} finally {
  for (const k of envKeys) {
    if (oldEnv[k] === undefined) delete process.env[k];
    else process.env[k] = oldEnv[k];
  }
  p.db.rollbackTransaction = originalRollback;
  if (transactionID) await originalRollback(transactionID);
  await p.destroy();
}

process.exit(0);
