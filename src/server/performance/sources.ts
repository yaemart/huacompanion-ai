import type { Payload, PayloadRequest } from "payload";
import type { Staff } from "../../../payload-types";
import type { IncidentDuty, IncidentSource } from "../../lib/performance-incidents";
import {
  canAccessContentKind,
  canReviewContent,
  isManager,
  isOperator,
  relationID,
} from "../../cms/access";
import { visaCheckerEnabled } from "../../lib/immigration-policy-flags";
import { ContentError } from "../content/error";

type Req = Partial<PayloadRequest> | undefined;
type Participants = Partial<Record<IncidentDuty, number[]>>;

export function staffIDs(value: unknown[]) {
  return [
    ...new Set(
      value.filter(
        (id): id is number => typeof id === "number" && Number.isSafeInteger(id) && id > 0,
      ),
    ),
  ];
}
const included = (value: unknown) => (Array.isArray(value) ? value : []);
export function fields(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
const closed = () => new ContentError("无法打开该来源，请从你有权查看的原记录重新进入。", 404);

async function caseInquiry(p: Payload, user: Staff, id: number, req: Req) {
  if (!isOperator(user)) throw closed();
  const service = await p.findByID({
    collection: "service-cases",
    id,
    depth: 0,
    req: { ...req },
    disableErrors: true,
  });
  const inquiry = relationID(service?.inquiry);
  if (!service || !inquiry) throw closed();
  const source = await p.findByID({
    collection: "inquiries",
    id: inquiry,
    user,
    overrideAccess: false,
    depth: 0,
    req: { ...req },
    disableErrors: true,
  });
  if (!source) throw closed();
  return { service, inquiry: source };
}
export async function complaintCustomerName(p: Payload, user: Staff, id: number, req: Req) {
  const { inquiry } = await caseInquiry(p, user, id, req);
  return inquiry.name;
}

export async function sourcePermission(
  p: Payload,
  user: Staff,
  source: IncidentSource,
  record: number,
  req?: Req,
) {
  if (source === "case") {
    const { inquiry } = await caseInquiry(p, user, record, req);
    return { review: isManager(user), team: relationID(inquiry.team) };
  }
  if (source === "content") {
    const draft = await p.findByID({
      collection: "content-drafts",
      id: record,
      depth: 0,
      req: { ...req },
      disableErrors: true,
    });
    if (!draft || !canAccessContentKind(user, draft.kind)) throw closed();
  } else {
    if (!visaCheckerEnabled() || !canAccessContentKind(user, "immigration-policy")) throw closed();
    const group = await p.findByID({
      collection: "policy-groups",
      id: record,
      depth: 0,
      req: { ...req },
      disableErrors: true,
    });
    if (!group) throw closed();
  }
  return { review: canReviewContent(user), team: undefined };
}

export async function sourceChoices(
  p: Payload,
  user: Staff,
  source: IncidentSource,
  record: number,
) {
  await sourcePermission(p, user, source, record);
  if (source === "case") {
    const { service } = await caseInquiry(p, user, record, undefined);
    return [{ id: service.id, label: service.title }];
  }
  if (source === "content") {
    const versions = await p.find({
      collection: "content-events",
      where: { and: [{ draftId: { equals: record } }, { action: { equals: "publish" } }] },
      limit: 50,
      depth: 0,
      sort: "-createdAt",
    });
    return versions.docs.map((event) => ({
      id: event.id,
      label: `正式版本 ${event.revision ?? "（早期记录）"} · ${String(fields(event.snapshot).title || "内容")}`,
    }));
  }
  const versions = await p.find({
    collection: source === "fact" ? "policy-fact-versions" : "policy-note-versions",
    where: { group: { equals: record } },
    limit: 50,
    depth: 0,
    sort: "-createdAt",
  });
  return versions.docs.map((event) => ({
    id: event.id,
    label: `${"locale" in event ? (event.locale === "zh" ? "中文说明" : "英文说明") : "共用事实"}第 ${event.revision} 版`,
  }));
}

export async function incidentSource(
  p: Payload,
  user: Staff,
  source: IncidentSource,
  record: number,
  version: number,
  occurredAt: string | undefined,
  req: Req,
) {
  await sourcePermission(p, user, source, record, req);
  if (source === "case") {
    const { inquiry, service } = await caseInquiry(p, user, record, req);
    if (version !== record || !occurredAt || occurredAt < inquiry.createdAt)
      throw new ContentError("请选择咨询收到之后的实际发生时间。");
    const at = occurredAt;
    const { docs: history } = await p.find({
      collection: "audit-events",
      where: {
        entity: { equals: "inquiries" },
        recordId: { equals: String(inquiry.id) },
      },
      sort: ["-createdAt", "-id"],
      pagination: false,
      depth: 0,
      req: { ...req },
    });
    let owner = relationID(inquiry.owner);
    let team = relationID(inquiry.team);
    for (const entry of history) {
      if (entry.createdAt <= at) break;
      if (entry.action !== "update") continue;
      const prior = fields(entry.before);
      if ("owner" in prior) owner = staffIDs([prior.owner])[0];
      if ("team" in prior) team = staffIDs([prior.team])[0];
    }
    let completeHistory =
      inquiry.updatedAt <= at || history.some((entry) => entry.action === "create");
    if (!completeHistory) {
      const prior = (
        await p.findVersions({
          collection: "inquiries",
          where: {
            and: [{ parent: { equals: inquiry.id } }, { updatedAt: { less_than_equal: at } }],
          },
          sort: "-updatedAt",
          limit: 1,
          depth: 0,
          req: { ...req },
        })
      ).docs[0]?.version;
      owner = relationID(prior?.owner);
      team = relationID(prior?.team);
      completeHistory = !!prior;
    }
    const involvement = await p.find({
      collection: "service-events",
      where: { serviceCase: { equals: service.id }, createdAt: { less_than_equal: at } },
      pagination: false,
      depth: 0,
      select: { actor: true },
      req: { ...req },
    });
    return {
      occurredAt: at,
      participants: {
        service: staffIDs([owner]),
        conflicts: staffIDs(involvement.docs.map((entry) => relationID(entry.actor))),
      },
      sourceTeam: team,
      completeHistory,
    };
  }
  if (source === "content") {
    const event = await p.findByID({
      collection: "content-events",
      id: version,
      depth: 0,
      req: { ...req },
      disableErrors: true,
    });
    if (!event || event.action !== "publish" || event.draftId !== record) throw closed();
    const snapshot = fields(event.publicationParticipants);
    const recorded = Array.isArray(snapshot.editing);
    const old = recorded
      ? undefined
      : (
          await p.findVersions({
            collection: "content-drafts",
            where: {
              and: [
                { parent: { equals: record } },
                { "version.revision": { equals: event.revision } },
              ],
            },
            limit: 1,
            depth: 0,
            req: { ...req },
          })
        ).docs[0]?.version;
    return {
      occurredAt: event.createdAt,
      sourceRevision: event.revision ?? undefined,
      completeHistory: recorded || (!!old && fields(event.snapshot).kind !== "immigration-policy"),
      participants: {
        review: staffIDs([event.actor]),
        editing: staffIDs([
          ...included(snapshot.editing ?? old?.contributors),
          old?.lastEditedBy,
          old?.submittedBy,
        ]),
        verification: staffIDs(included(snapshot.verification)),
      } satisfies Participants,
    };
  }
  const event = await p.findByID({
    collection: source === "fact" ? "policy-fact-versions" : "policy-note-versions",
    id: version,
    depth: 0,
    req: { ...req },
    disableErrors: true,
  });
  if (!event || relationID(event.group) !== record) throw closed();
  return {
    occurredAt: event.createdAt,
    sourceRevision: event.revision,
    sourceLocale: "locale" in event ? event.locale : undefined,
    completeHistory: true,
    participants: {
      review: staffIDs([event.approvedBy]),
      editing: staffIDs(included(event.contributors)),
      verification: staffIDs(["facts" in event ? fields(event.facts).verifiedBy : undefined]),
    } satisfies Participants,
  };
}
