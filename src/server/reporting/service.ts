import type { CollectionSlug, Payload, Where } from "payload";
import type { Staff } from "../../cms/access";
import { isAdmin, isOperator, relationID } from "../../cms/access";
import { ContentError } from "../content/service";
import {
  csvDocument,
  parseFilters,
  summarize,
  inquiryStatuses,
  providerStatuses,
  type ReportFilters,
} from "../../lib/reporting";

async function actorFor(p: Payload, user: Staff) {
  if (!user || !isOperator(user)) throw new ContentError("需要业务运营权限", 403);
  const actor = await p.findByID({ collection: "staff", id: user.id, depth: 0 });
  if (!isOperator(actor)) throw new ContentError("员工权限已撤销", 403);
  return actor;
}
async function all<T extends CollectionSlug>(
  p: Payload,
  collection: T,
  where: Where,
  user?: NonNullable<Staff>,
) {
  const docs = [];
  let page = 1;
  while (true) {
    const result = await p.find({
      collection,
      where,
      user,
      overrideAccess: !user,
      depth: 0,
      limit: 500,
      page,
      sort: "id",
    });
    if (result.totalDocs > 100000) throw new ContentError("记录超过十万条，请缩小日期范围", 413);
    docs.push(...result.docs);
    if (!result.hasNextPage) break;
    page++;
  }
  return docs;
}
function filtersOf(input: unknown) {
  try {
    return parseFilters(input);
  } catch (error) {
    throw new ContentError((error as Error).message);
  }
}
function whereOf(filters: ReportFilters, collection: "inquiries" | "providers"): Where {
  const statuses = collection === "inquiries" ? inquiryStatuses : providerStatuses;
  if (filters.status && !statuses.includes(filters.status)) return { id: { equals: -1 } };
  const conditions: Where[] = [];
  if (filters.from)
    conditions.push({ createdAt: { greater_than_equal: `${filters.from}T00:00:00+08:00` } });
  if (filters.to)
    conditions.push({
      createdAt: {
        less_than: new Date(Date.parse(`${filters.to}T00:00:00+08:00`) + 86400000).toISOString(),
      },
    });
  if (filters.status) conditions.push({ status: { equals: filters.status } });
  if (filters.category) conditions.push({ categories: { contains: filters.category } });
  return conditions.length ? { and: conditions } : {};
}
async function quoteHistory(p: Payload, ids: number[]) {
  const cases = ids.length ? await all(p, "service-cases", { inquiry: { in: ids } }) : [];
  const byCase = new Map(cases.map((record) => [record.id, relationID(record.inquiry)! as number]));
  const quotes = cases.length
    ? await all(p, "service-quotes", { serviceCase: { in: cases.map((record) => record.id) } })
    : [];
  return quotes.map((quote) => ({
    ...quote,
    inquiry: byCase.get(relationID(quote.serviceCase) as number)!,
  }));
}
async function responseHistory(
  p: Payload,
  actor: NonNullable<Staff>,
  references: Map<string, number>,
) {
  const responses = new Map<number, string[]>();
  if (!references.size) return responses;
  const conversations = await all(p, "support-conversations", {}, actor);
  for (const conversation of conversations) {
    const links = Array.isArray(conversation.inquiryLinks) ? conversation.inquiryLinks : [];
    const ids = links.flatMap((link) => {
      if (
        !link ||
        typeof link !== "object" ||
        !("reference" in link) ||
        typeof link.reference !== "string"
      )
        return [];
      const id = references.get(link.reference);
      return id === undefined ? [] : [id];
    });
    if (!ids.length) continue;
    const messages = await all(p, "support-messages", {
      and: [
        { conversation: { equals: conversation.id } },
        { author: { equals: "staff" } },
        { visibility: { equals: "public" } },
        { staff: { exists: true } },
      ],
    });
    for (const id of ids)
      responses.set(id, [
        ...(responses.get(id) || []),
        ...messages.map((message) => message.createdAt),
      ]);
  }
  return responses;
}
export async function reportingRead(p: Payload, user: Staff, input: unknown = {}) {
  const actor = await actorFor(p, user);
  const filters = filtersOf(input);
  const inquiries = await all(p, "inquiries", whereOf(filters, "inquiries"), actor);
  const providers = await all(p, "providers", whereOf(filters, "providers"), actor);
  const quotes = await quoteHistory(
    p,
    inquiries.map((inquiry) => inquiry.id),
  );
  const responses = await responseHistory(
    p,
    actor,
    new Map(inquiries.map((inquiry) => [inquiry.reference, inquiry.id])),
  );
  return {
    canSensitive: isAdmin(actor),
    summary: summarize(
      inquiries,
      providers,
      quotes.map((quote) => ({
        inquiry: quote.inquiry,
        sentAt: quote.sentAt,
        confirmedAt: quote.confirmedBy ? quote.confirmedAt : null,
      })),
      responses,
    ),
  };
}
export async function reportingExport(p: Payload, user: Staff, input: unknown) {
  const actor = await actorFor(p, user);
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new ContentError("导出格式无效");
  if (Object.keys(input).some((key) => !["entity", "filters", "includeSensitive"].includes(key)))
    throw new ContentError("不支持的导出字段");
  const request = input as { entity?: unknown; filters?: unknown; includeSensitive?: unknown };
  if (request.entity !== "inquiries" && request.entity !== "providers")
    throw new ContentError("导出类型无效");
  if (request.includeSensitive !== undefined && typeof request.includeSensitive !== "boolean")
    throw new ContentError("敏感字段选项无效");
  const sensitive = request.includeSensitive === true;
  if (sensitive && !isAdmin(actor)) throw new ContentError("仅管理员可显式导出敏感字段", 403);
  const filters = filtersOf(request.filters || {});
  const records = await all(p, request.entity, whereOf(filters, request.entity), actor);
  const headers = ["编号", "姓名", "邮箱", "服务类别", "城市", "状态", "来源", "创建时间"];
  if (request.entity === "providers") headers.push("机构", "电话", "语言", "能力");
  if (sensitive) headers.push("内部备注");
  const quotes =
    sensitive && request.entity === "inquiries"
      ? await quoteHistory(
          p,
          records.map((record) => record.id),
        )
      : [];
  if (sensitive && request.entity === "inquiries")
    headers.push("报价版本/币种/报价最小货币单位/内部成本最小货币单位");
  const rows = records.map((record) => {
    const row: unknown[] = [
      record.reference,
      record.name,
      record.email,
      record.categories.join(";"),
      record.city,
      record.status,
      record.source,
      record.createdAt,
    ];
    if ("organisation" in record)
      row.push(record.organisation, record.phone, record.languages, record.capabilities);
    if (sensitive) row.push(record.notes);
    if (sensitive && request.entity === "inquiries")
      row.push(
        quotes
          .filter((quote) => quote.inquiry === record.id)
          .map(
            (quote) =>
              `v${quote.revision} / ${quote.currency} / ${quote.totalMinor} / ${quote.internalCostMinor ?? ""}`,
          )
          .join("\n"),
      );
    return row;
  });
  const csv = csvDocument(headers, rows);
  // Persist the audit before returning any CSV. Failure prevents disclosure.
  const audit = await p.create({
    collection: "audit-events",
    data: {
      entity: request.entity,
      recordId: "export",
      action: "csv-export",
      actor: actor.id,
      fields: headers.join(","),
      after: { filters, count: records.length, includeSensitive: sensitive },
    },
  });
  return { csv, count: records.length, auditId: audit.id };
}
