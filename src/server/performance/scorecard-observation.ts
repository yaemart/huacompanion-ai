import type { PostgresAdapter } from "@payloadcms/db-postgres";
import {
  observeMetric,
  observationMode,
  scorecardMetricKeys,
  validateScorecardRules,
  type ScorecardMetric,
} from "../../lib/staff-scorecard";
import { findingStatus, type performanceMonth } from "../../lib/staff-monthly-performance";
import { chinaDay } from "../../lib/staff-today";
import type { IncidentSource } from "../../lib/performance-incidents";
import { identifiableStaffReplies } from "./monthly-queries";

type Period = NonNullable<ReturnType<typeof performanceMonth>>;
type ObservationInputs = {
  response: { minutes: number | null; samples: number };
  review: { minutes: number | null; samples: number; decisions: number; returned: number };
  followup: { due: number; onTime: number };
  incidents: { complaints: number; corrections: number };
  pending: { source: IncidentSource; reason: string }[];
  reviewTasks: { overdue: number; due: number };
};
type QualityEvent = {
  id: number;
  related: number | null;
  confirmedAt: Date | null;
  notifiedAt: Date | null;
  appealAt: Date | null;
  resolvedAt: Date | null;
};
type Exposure = { handled: number; published: number };
type Correction = { id: number; at: string; result: "upheld" | "changed" | "dismissed" };

const exposureQuery = `
  WITH handled AS (
    SELECT record_id AS id FROM audit_events
    WHERE entity = 'inquiries' AND action = 'followup-appended' AND actor_id = $1
      AND created_at >= $2 AND created_at < $3::timestamptz
    UNION
    SELECT c.inquiry_id::text FROM service_events e JOIN service_cases c ON c.id = e.service_case_id
    WHERE e.actor_id = $1 AND e.action IN ('send', 'stage', 'arrange', 'summary')
      AND e.created_at >= $2 AND e.created_at < $3
    UNION
    SELECT inquiry::text FROM (${identifiableStaffReplies}) replies
    WHERE staff = $1 AND responded >= $2 AND responded < $3
  ), published AS (
    SELECT id FROM content_events WHERE action = 'publish' AND created_at >= $2 AND created_at < $3
      AND (actor = $1 OR publication_participants->'editing' @> jsonb_build_array($1::integer))
    UNION ALL
    SELECT id FROM policy_fact_versions WHERE created_at >= $2 AND created_at < $3
      AND (approved_by = $1 OR contributors @> jsonb_build_array($1::integer))
    UNION ALL
    SELECT id FROM policy_note_versions WHERE created_at >= $2 AND created_at < $3
      AND (approved_by = $1 OR contributors @> jsonb_build_array($1::integer))
  )
  SELECT (SELECT count(*)::integer FROM handled) AS handled,
         (SELECT count(*)::integer FROM published) AS published
`;

const relatedQualityQuery = `
  WITH RECURSIVE own AS (
    SELECT i.id, i.first_confirmed_at AS "confirmedAt", f.notified_at AS "notifiedAt",
           f.appeal_at AS "appealAt", f.resolved_at AS "resolvedAt"
    FROM performance_findings f JOIN performance_incidents i ON i.id = f.incident_id
    WHERE f.staff_id = $1 AND f.active AND i.state = 'confirmed' AND i.responsibility = 'company'
      AND i.duplicate_of IS NULL AND i.first_confirmed_at < $2::timestamptz
  ), linked(id) AS (
    SELECT id FROM own
    UNION
    SELECT CASE WHEN i.id = linked.id THEN i.related_incident::integer ELSE i.id END
    FROM linked JOIN performance_incidents i ON (i.id = linked.id OR i.related_incident = linked.id)
    WHERE i.related_incident IS NOT NULL AND i.first_confirmed_at < $2
  )
  SELECT i.id, CASE WHEN i.first_confirmed_at < $2 THEN i.related_incident::integer END AS related,
         o."confirmedAt", o."notifiedAt", o."appealAt", o."resolvedAt"
  FROM linked JOIN performance_incidents i USING (id) LEFT JOIN own o USING (id)
`;

const correctionsQuery = `
  SELECT i.id, a."after"->>'at' AS at, a."after"->>'result' AS result
  FROM audit_events a JOIN performance_incidents i ON i.id::text = a.record_id
  WHERE a.entity = 'performance-incident' AND a.action = 'resolve'
    AND i.first_confirmed_at >= $2 AND i.first_confirmed_at < $3::timestamptz
    AND (a."after"->>'at')::timestamptz <= $4::timestamptz AND a."after"->>'result' IN ('upheld', 'changed', 'dismissed')
    AND EXISTS (
      SELECT 1 FROM performance_findings f WHERE f.incident_id = i.id AND f.staff_id = $1
        AND (f.id::text IN (a."after"->>'finding', a."after"->>'replacement')
          OR a."after"->'affected' @> jsonb_build_array(f.id)
          OR EXISTS (
            SELECT 1 FROM workflow_notifications n WHERE n.recipient_id = $1 AND n.performance_incident = i.id
              AND n.key = concat('performance:', f.id, ':resolved:', a."after"->>'result', ':', a."after"->>'at')
          ))
    )
  ORDER BY (a."after"->>'at')::timestamptz DESC, a.id DESC
`;

function countLinkedQuality(rows: QualityEvent[], month: string, now: number) {
  const parent = new Map(rows.map(({ id }) => [id, id]));
  const root = (id: number) => {
    while (parent.get(id) !== id) id = parent.get(id)!;
    return id;
  };
  for (const { id, related } of rows)
    if (related !== null && parent.has(related)) parent.set(root(id), root(related));

  const groups = new Map<number, { countedAt: number; pendingHere: boolean }>();
  for (const row of rows) {
    if (!row.confirmedAt || !row.notifiedAt) continue;
    const phase = findingStatus(
      {
        active: true,
        notifiedAt: row.notifiedAt.toISOString(),
        appealAt: row.appealAt?.toISOString(),
        resolvedAt: row.resolvedAt?.toISOString(),
      },
      now,
    );
    const key = root(row.id);
    const group = groups.get(key) ?? { countedAt: Infinity, pendingHere: false };
    const time = row.confirmedAt.getTime();
    if (phase === "counted") group.countedAt = Math.min(group.countedAt, time);
    else if (chinaDay(time).date.startsWith(month)) group.pendingHere = true;
    groups.set(key, group);
  }
  let value = 0;
  let pending = 0;
  for (const group of groups.values()) {
    if (group.pendingHere) pending++;
    if (Number.isFinite(group.countedAt) && chinaDay(group.countedAt).date.startsWith(month))
      value++;
  }
  return { value, pending };
}

export async function readScorecardObservation(
  client: Pick<PostgresAdapter["pool"], "query">,
  staff: number | null,
  period: Period,
  now: number,
  input: ObservationInputs,
) {
  const plan = (
    await client.query<{ effectiveMonth: string; revision: string; configuration: unknown }>(
      `SELECT effective_month AS "effectiveMonth", revision, configuration FROM scorecard_plans
     WHERE effective_month <= $1 ORDER BY effective_month DESC LIMIT 1`,
      [period.month],
    )
  ).rows[0];
  if (!plan) return null;
  const rules = validateScorecardRules(plan.configuration);
  const template = staff === null ? undefined : rules.assignments[String(staff)];
  const mode = observationMode(period.month, rules.trialStart);
  const base = {
    mode,
    trialStart: rules.trialStart,
    version: plan.revision,
    effectiveMonth: plan.effectiveMonth,
  };
  if (staff === null || !template)
    return { ...base, template, metrics: undefined, corrections: undefined, coverage: undefined };

  const args = [staff, period.start, period.through];
  const exposure = (await client.query<Exposure>(exposureQuery, args)).rows[0];
  const quality =
    template === "combined"
      ? countLinkedQuality(
          (await client.query<QualityEvent>(relatedQualityQuery, [staff, new Date(now)])).rows,
          period.month,
          now,
        )
      : { value: 0, pending: 0 };
  const corrections = (await client.query<Correction>(correctionsQuery, [...args, new Date(now)]))
    .rows;
  const knownPending = input.pending.filter(({ reason }) => reason !== "confirmation");
  const { response, review, followup, incidents, reviewTasks } = input;
  const evidence: Record<ScorecardMetric, Parameters<typeof observeMetric>[2]> = {
    response: { value: response.minutes, samples: response.samples },
    followup: {
      value: followup.due ? (100 * followup.onTime) / followup.due : null,
      samples: followup.due,
    },
    complaints: {
      value: incidents.complaints,
      samples: exposure.handled,
      pending: knownPending.filter(({ source }) => source === "case").length,
    },
    planned: { value: null, samples: null },
    returnRate: {
      value: review.decisions ? (100 * review.returned) / review.decisions : null,
      samples: review.decisions,
    },
    corrections: {
      value: incidents.corrections,
      samples: exposure.published,
      pending: knownPending.filter(({ source }) => source !== "case").length,
    },
    overdue: { value: reviewTasks.overdue, samples: reviewTasks.due },
    reviewTime: { value: review.minutes, samples: review.samples },
    quality: { ...quality, samples: exposure.handled + exposure.published },
  };
  const keys = scorecardMetricKeys.filter((key) => key !== "quality" || template === "combined");
  const metrics = keys.map((key) =>
    observeMetric(key, rules.templates[template][key], evidence[key]),
  );
  const eligible = metrics.filter(({ status }) => status === "eligible");
  const weight = eligible.reduce((total, metric) => total + metric.rule.weight, 0);
  const waiting = metrics.some(({ status, rule }) => rule.weight > 0 && status === "pending");
  const coverage = {
    weight,
    items: eligible.length,
    waiting,
    sufficient: !waiting && weight >= 70 && eligible.length >= 2,
  };
  return { ...base, template, metrics, corrections, coverage };
}
