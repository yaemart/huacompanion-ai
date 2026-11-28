import { sql } from "@payloadcms/db-postgres";
import type { Payload, PayloadRequest } from "payload";
import { CrmError } from "../../lib/crm";
import type {
  OverviewQuery,
  OverviewDetail,
  InquiryRow,
  PrimaryContact,
  RecentUpdate,
} from "../../lib/crm-overview";
import { unavailable, type CrmActor } from "./access";
import {
  rows,
  overviewCTE,
  clientColumns,
  clientDTO,
  integer,
  ownerColumns,
  ownerDTO,
  page,
  scopeSQL,
  time,
} from "./overview-query";
export async function readOverviewDetail(
  p: Payload,
  actor: CrmActor,
  input: OverviewQuery,
  req: Partial<PayloadRequest>,
  asOf: string,
): Promise<OverviewDetail> {
  const clients = await rows(
    p,
    req,
    sql`${overviewCTE(actor, asOf)} SELECT ${clientColumns()}
    FROM crm_clients c LEFT JOIN staff o ON o.id=c.owner_id LEFT JOIN stats st ON st.client_id=c.id
    WHERE c.id=${input.clientID} AND ${scopeSQL("c", actor)}`,
  );
  if (!clients.length) throw unavailable();
  const client = clientDTO(clients[0]);
  const contacts = await rows(
    p,
    req,
    sql`SELECT id,client_id,name,email,phone,job_title,is_primary,status,revision
    FROM crm_contacts WHERE client_id=${client.id} AND is_primary=true AND status='active' LIMIT 2`,
  );
  if (contacts.length > 1) throw new CrmError("主联系人资料异常，请联系管理员核对", 503);
  const c = contacts[0];
  const primaryContact: PrimaryContact | null = c
    ? {
        id: integer(c.id),
        clientID: client.id,
        name: String(c.name),
        email: c.email == null ? null : String(c.email),
        phone: c.phone == null ? null : String(c.phone),
        jobTitle: c.job_title == null ? null : String(c.job_title),
        isPrimary: true,
        status: "active",
        revision: integer(c.revision),
      }
    : null;
  const source = sql`FROM inquiries q JOIN crm_inquiry_links l ON l.inquiry_id=q.id AND l.active=true
    WHERE l.client_id=${client.id} AND ${scopeSQL("q", actor)}`;
  const count = await rows(p, req, sql`SELECT count(*)::integer AS total ${source}`);
  const inquiries = await rows(
    p,
    req,
    sql`SELECT q.id,q.reference,q.name,q.status,q.owner_id,q.team_id,
    q.next_follow_up,q.updated_at,${ownerColumns("q")},s.id AS case_id,s.title AS case_title,
    s.stage AS case_stage,s.revision AS case_revision,s.latest_quote_id,qt.id AS quote_id,
    qt.revision AS quote_revision,qt.status AS quote_status FROM inquiries q
    JOIN crm_inquiry_links l ON l.inquiry_id=q.id AND l.active=true
    LEFT JOIN staff o ON o.id=q.owner_id LEFT JOIN service_cases s ON s.inquiry_id=q.id
    LEFT JOIN service_quotes qt ON qt.id=s.latest_quote_id AND qt.service_case_id=s.id
    WHERE l.client_id=${client.id} AND ${scopeSQL("q", actor)}
    ORDER BY q.created_at DESC,q.id DESC LIMIT ${input.limit} OFFSET ${(input.page - 1) * input.limit}`,
  );
  const items = inquiries.map((r): InquiryRow => {
    if (r.latest_quote_id != null && r.quote_id == null)
      throw new CrmError("报价归属资料异常，请联系管理员核对", 503);
    const serviceCase =
      r.case_id == null
        ? null
        : {
            id: integer(r.case_id),
            title: String(r.case_title),
            stage: String(r.case_stage),
            revision: integer(r.case_revision),
            latestQuote:
              r.quote_id == null
                ? null
                : {
                    id: integer(r.quote_id),
                    revision: integer(r.quote_revision),
                    status: String(r.quote_status),
                  },
          };
    return {
      id: integer(r.id),
      reference: String(r.reference),
      name: String(r.name),
      status: String(r.status),
      ownerDisplay: ownerDTO(r),
      nextFollowUp: r.next_follow_up == null ? null : time(r.next_follow_up),
      updatedAt: time(r.updated_at),
      needsReview:
        r.team_id == null ||
        Number(r.team_id) !== client.teamID ||
        (r.status === "closed" &&
          serviceCase !== null &&
          !["completed", "cancelled"].includes(serviceCase.stage)),
      serviceCase,
    };
  });
  const updates = await rows(
    p,
    req,
    sql`WITH events AS (
    SELECT 'client-created'::text AS kind,c.id,c.created_at AS at FROM crm_clients c WHERE c.id=${client.id}
    UNION ALL SELECT 'client',c.id,c.updated_at FROM crm_clients c WHERE c.id=${client.id}
    UNION ALL SELECT 'inquiry',q.id,q.updated_at ${source}
    UNION ALL SELECT 'serviceCase',s.id,s.updated_at FROM service_cases s JOIN inquiries q ON q.id=s.inquiry_id
      JOIN crm_inquiry_links l ON l.inquiry_id=q.id AND l.active=true
      WHERE l.client_id=${client.id} AND ${scopeSQL("q", actor)})
    SELECT * FROM events ORDER BY at DESC,kind ASC,id DESC LIMIT 20`,
  );
  const labels = {
    "client-created": "客户建立",
    client: "客户资料更新",
    inquiry: "咨询最近更新",
    serviceCase: "服务单最近更新",
  };
  const recentUpdates = updates.map((r): RecentUpdate => {
    const kind = r.kind as RecentUpdate["kind"];
    return { kind, id: integer(r.id), at: time(r.at), label: labels[kind] };
  });
  return {
    client,
    primaryContact,
    inquiries: page(items, integer(count[0].total, 0), input, asOf),
    recentUpdates,
  };
}
