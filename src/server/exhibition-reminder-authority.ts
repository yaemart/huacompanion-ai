import { createLocalReq, type Payload, type PayloadRequest } from "payload";
import { sql } from "@payloadcms/db-postgres";
import { requireSubscriptionAdmin } from "./subscription-management";
import { executeSQL, transactionSession } from "./db-types";
import { ContentError } from "./content/error";

export async function authenticateReminderAdmin(
  p: Payload,
  headers: Headers,
  req?: Partial<PayloadRequest>,
) {
  if (process.env.APP_ENV !== "local") throw new ContentError("仅支持本地提醒核实。", 403);
  const local = req ? await createLocalReq({ req }, p) : undefined;
  const { user } = await p.auth({ headers, req: local });
  if (user?.collection !== "staff") throw new ContentError("请使用管理员账号登录。", 403);
  await requireSubscriptionAdmin(p, user, req);
  return user;
}
export async function withReminderReadOnly<T>(
  p: Payload,
  headers: Headers,
  work: (context: {
    req: Partial<PayloadRequest>;
    user: Awaited<ReturnType<typeof authenticateReminderAdmin>>;
  }) => Promise<T>,
) {
  const first = await authenticateReminderAdmin(p, headers);
  let id: string | number | null = null;
  try {
    id = await p.db.beginTransaction();
    if (!id) throw Error("Readonly reminder transaction required");
    const db = transactionSession(p, id).db,
      req = { transactionID: id };
    await db.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await db.execute("SET LOCAL statement_timeout='10s'");
    const user = await authenticateReminderAdmin(p, headers, req);
    if (user.id !== first.id) throw new ContentError("登录会话已变化。", 403);
    const result = await work({ req, user });
    await p.db.rollbackTransaction(id);
    id = null;
    if ((await authenticateReminderAdmin(p, headers)).id !== first.id)
      throw new ContentError("登录会话已变化。", 403);
    return result;
  } finally {
    if (id) await p.db.rollbackTransaction(id);
  }
}
export async function withLockedReminderAuthority<T>(
  p: Payload,
  headers: Headers,
  work: Parameters<typeof withReminderReadOnly<T>>[2],
) {
  await authenticateReminderAdmin(p, headers);
  const id = await p.db.beginTransaction();
  if (!id) throw Error("Reminder transaction required");
  try {
    await transactionSession(p, id).db.execute("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
    await transactionSession(p, id).db.execute("SET LOCAL statement_timeout='10s'");
    for (const lock of [726271, 726281, 726272])
      await executeSQL(p, id, sql`SELECT pg_advisory_xact_lock(${lock})`);
    const req = { transactionID: id };
    const user = await authenticateReminderAdmin(p, headers, req);
    const result = await work({ req, user });
    await p.db.commitTransaction(id);
    return result;
  } catch (error) {
    await p.db.rollbackTransaction(id);
    throw error;
  }
}
