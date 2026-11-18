import { getPayload, type Payload } from "payload";
import config from "../payload.config";
import { isActiveStaff, isAdmin, type Staff } from "../cms/access";
import { isContentIdentifier } from "../lib/content-identifiers";
import { subscriptionTopics } from "../lib/subscription-topics";
import { ContentError } from "./content/error";

export const subscriptionStates = {
  pending: "待确认",
  confirmed: "已订阅",
  unsubscribed: "已退订",
};
type TopicCount = { topic: string; pending: number; confirmed: number; unsubscribed: number };
type SubscriptionRow = {
  id: number;
  email: string;
  topic: string;
  locale: string;
  status: keyof typeof subscriptionStates;
  consentedAt: Date;
  confirmedAt: Date | null;
  unsubscribedAt: Date | null;
};

async function requireAdmin(payload: Payload, user: Staff) {
  if (!user || !isActiveStaff(user)) throw new ContentError("请使用管理员账号登录。", 403);
  const current = await payload.findByID({
    collection: "staff",
    id: user.id,
    depth: 0,
    disableErrors: true,
  });
  if (!isAdmin(current)) throw new ContentError("订阅管理仅限有效的管理员账号查看。", 403);
}

export async function subscriptionAdminAuth(headers: Headers) {
  const p = await getPayload({ config });
  const { user } = await p.auth({ headers });
  if (user?.collection !== "staff") throw new ContentError("请使用管理员账号登录。", 403);
  await requireAdmin(p, user);
  return { p, user };
}

function filters(input: Record<string, unknown>) {
  if (Object.keys(input).some((key) => !["topic", "status", "page"].includes(key)))
    throw new ContentError("筛选条件无效，请从订阅管理重新选择。");
  const { topic = "", status = "", page = "1" } = input;
  if (
    typeof topic !== "string" ||
    (topic !== "" &&
      !Object.hasOwn(subscriptionTopics, topic) &&
      !(topic.startsWith("exhibition:") && isContentIdentifier(topic.slice(11))))
  )
    throw new ContentError("请选择有效的订阅主题。");
  if (typeof status !== "string" || (status !== "" && !Object.hasOwn(subscriptionStates, status)))
    throw new ContentError("请选择有效的订阅状态。");
  if (typeof page !== "string" || !/^[1-9]\d{0,5}$/.test(page))
    throw new ContentError("页码无效，请重新打开订阅管理。");
  return { topic, status, page: Number(page) };
}

async function readSnapshot(payload: Payload, query: ReturnType<typeof filters>) {
  const client = await payload.db.pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const { rows: counts } = await client.query<TopicCount>(`
      SELECT topic, count(*) FILTER (WHERE status='pending')::int AS pending,
        count(*) FILTER (WHERE status='confirmed')::int AS confirmed,
        count(*) FILTER (WHERE status='unsubscribed')::int AS unsubscribed
      FROM subscriptions GROUP BY topic ORDER BY topic
    `);
    const { rows: exhibitions } = await client.query<{ key: string; title: string }>(`
      SELECT DISTINCT ON (body->>'contentKey') body->>'contentKey' AS key, body->>'title' AS title
      FROM content_published WHERE active=true AND body->>'kind'='exhibition'
      ORDER BY body->>'contentKey', (body->>'locale'='zh') DESC, id DESC
    `);
    const topics = [
      ...new Set([...Object.keys(subscriptionTopics), ...counts.map((row) => row.topic)]),
    ].map((topic) => ({
      ...(counts.find((row) => row.topic === topic) ?? {
        topic,
        pending: 0,
        confirmed: 0,
        unsubscribed: 0,
      }),
      title:
        subscriptionTopics[topic]?.zh ??
        `单场展会 · ${exhibitions.find((row) => "exhibition:" + row.key === topic)?.title || topic.slice(11)}`,
    }));
    const matching = topics.filter((row) => !query.topic || row.topic === query.topic);
    const total = matching.reduce(
      (sum, row) =>
        sum +
        (query.status
          ? row[query.status as keyof typeof subscriptionStates]
          : row.pending + row.confirmed + row.unsubscribed),
      0,
    );
    const pages = Math.max(1, Math.ceil(total / 25));
    const page = Math.min(query.page, pages);
    const { rows } = await client.query<SubscriptionRow>(
      `
      SELECT id, email, topic, locale, status, consented_at AS "consentedAt",
        confirmed_at AS "confirmedAt", unsubscribed_at AS "unsubscribedAt"
      FROM subscriptions WHERE ($1::text='' OR topic=$1) AND ($2::text='' OR status::text=$2)
      ORDER BY consented_at DESC, id DESC LIMIT 25 OFFSET $3
    `,
      [query.topic, query.status, (page - 1) * 25],
    );
    const { rows: clock } = await client.query<{ at: Date }>(
      "SELECT transaction_timestamp() AS at",
    );
    await client.query("COMMIT");
    const date = (value: Date | null) => value?.toISOString() ?? null;
    return {
      topics,
      total,
      pages,
      page,
      filters: { topic: query.topic, status: query.status },
      asOf: clock[0].at.toISOString(),
      rows: rows.map((row) => ({
        ...row,
        consentedAt: row.consentedAt.toISOString(),
        confirmedAt: date(row.confirmedAt),
        unsubscribedAt: date(row.unsubscribedAt),
      })),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function readSubscriptionManagement(
  payload: Payload,
  user: Staff,
  input: Record<string, unknown>,
) {
  await requireAdmin(payload, user);
  const report = await readSnapshot(payload, filters(input));
  // Release the snapshot connection before asking Payload for a fresh authority check.
  await requireAdmin(payload, user);
  return report;
}
