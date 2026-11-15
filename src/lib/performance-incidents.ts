import { chinaDay } from "./staff-today.ts";

export const incidentSources = ["case", "content", "fact", "note"] as const;
export type IncidentSource = (typeof incidentSources)[number];
export const incidentStatuses = ["pending", "confirmed", "dismissed"] as const;
export const incidentResponsibilities = ["company", "supplier", "unassigned"] as const;
export const incidentRoles = ["service", "editing", "verification", "review"] as const;
export type IncidentDuty = (typeof incidentRoles)[number];
export const factIssueLabels = {
  eligibility: "国家、类型或适用对象",
  stay: "停留时长",
  validity: "生效日或截止日",
  ports: "口岸或区域条件",
  source: "官方来源",
  other: "其他共用事实",
} as const;
export const dutyLabels = {
  service: "服务处理",
  editing: "编辑",
  verification: "核实",
  review: "审核",
};
export const appealResults = ["upheld", "changed", "dismissed"] as const;
const day = 86400000;

type Appeal = {
  active: boolean;
  notifiedAt: string;
  appealAt?: string | null;
  resolvedAt?: string | null;
};

export function normalizedIssue(title: string) {
  return title
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}]/gu, "");
}

export function appealClosesAt(at: string) {
  return new Date(Date.parse(chinaDay(Date.parse(at)).end) + 7 * day).toISOString();
}

export function canAppeal(finding: Appeal, now: number) {
  return (
    finding.active &&
    !finding.appealAt &&
    now >= Date.parse(finding.notifiedAt) &&
    now < Date.parse(appealClosesAt(finding.notifiedAt))
  );
}

export function incidentPhase(
  incident: { state: (typeof incidentStatuses)[number]; firstConfirmedAt?: string | null },
  findings: Appeal[],
  now: number,
) {
  const month = incident.firstConfirmedAt
    ? chinaDay(Date.parse(incident.firstConfirmedAt)).date.slice(0, 7)
    : null;
  const pending = findings.some(
    (item) => item.active && (canAppeal(item, now) || (item.appealAt && !item.resolvedAt)),
  );
  return { state: incident.state === "confirmed" && pending ? "pending" : incident.state, month };
}

export function independentReviewer(
  actor: number,
  involved: readonly number[],
  decisionBy?: number | null,
) {
  return !involved.includes(actor) && actor !== decisionBy;
}
