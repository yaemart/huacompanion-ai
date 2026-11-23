import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Payload } from "payload";
import type pg from "pg";
import type { Staff } from "../../src/cms/access";
import { readCampaignReviewDetails } from "../../src/server/subscription-campaign-review";
import { databaseFingerprints } from "./database-fingerprints";
import { observePGQueries, type ObservedStatement } from "./observe-pg-queries";

type PlanNode = {
  "Relation Name"?: string;
  "Actual Loops"?: number;
  "Parallel Aware"?: boolean;
  "Shared Hit Blocks"?: number;
  "Shared Read Blocks"?: number;
  Plans?: PlanNode[];
};
type Plan = { Plan: PlanNode; "Execution Time": number };
const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const work = (plans: Plan[]) => {
  let scans = 0,
    sharedBlocks = 0;
  const walk = (node: PlanNode) => {
    if (node["Relation Name"] === "audit_events")
      scans += node["Parallel Aware"] ? 1 : (node["Actual Loops"] ?? 0);
    for (const child of node.Plans ?? []) walk(child);
  };
  for (const plan of plans) {
    walk(plan.Plan);
    sharedBlocks += (plan.Plan["Shared Hit Blocks"] ?? 0) + (plan.Plan["Shared Read Blocks"] ?? 0);
  }
  return {
    scans,
    sharedBlocks,
    executionMs: plans.reduce((sum, plan) => sum + plan["Execution Time"], 0),
  };
};

export async function assertReviewAuditPerformance(
  p: Payload,
  db: pg.Client,
  actor: Staff,
  input: { campaignKey: string; revision: number },
  expectedPage: Awaited<ReturnType<typeof readCampaignReviewDetails>>,
) {
  assert.equal(expectedPage.rows.length, 25);
  const marker = "review-performance:" + randomUUID();
  const actorId = Number(actor!.id);
  const targets = (
    await db.query<{ slot: number; attempt: number; lease: number | null }>(
      `
    SELECT s.id AS slot,a.id AS attempt,l.id AS lease FROM subscription_campaign_mock_slots s
    JOIN subscription_campaign_mock_attempts a ON a.slot_id=s.id
    LEFT JOIN subscription_campaign_mock_leases l ON l.slot_id=s.id
    WHERE s.id=ANY($1) ORDER BY s.id`,
      [expectedPage.rows.map((row) => row.slotId)],
    )
  ).rows;
  const head = targets[0];
  const noiseRows = 100000,
    hotRows = 10000;
  try {
    // Every selected task has an audit; a global LIMIT 21 would silently drop tasks.
    for (const target of targets)
      await db.query(
        `INSERT INTO audit_events
      (entity,record_id,actor_id,action,fields,"after") VALUES
      ('subscription-campaign-mock-attempts',$1,$2,'begin-mock-attempt',$3,jsonb_build_object('slotId',$4::int))`,
        [String(target.attempt), actorId, marker, target.slot],
      );
    await db.query(
      `INSERT INTO audit_events(entity,record_id,actor_id,action,fields,"after")
      SELECT CASE WHEN i%4=3 THEN 'other-entity' ELSE 'subscription-campaign-mock-attempts' END,
        CASE WHEN i%4=1 THEN $1||i::text ELSE $2 END,$3,
        CASE WHEN i%4=2 THEN 'not-visible' ELSE 'begin-mock-attempt' END,$1,
        jsonb_build_object('slotId',CASE WHEN i%4=0 THEN -$4::int ELSE $4::int END,'token','PERF_PRIVATE')
      FROM generate_series(1,$5::int) i`,
      [marker, String(head.attempt), actorId, head.slot, noiseRows],
    );
    await db.query(
      `INSERT INTO audit_events(entity,record_id,actor_id,action,fields,"after")
      SELECT 'subscription-campaign-mock-attempts',$1,$2,'begin-mock-attempt',$3,
        jsonb_build_object('slotId',$4::int,'body','PERF_PRIVATE') FROM generate_series(1,$5::int)`,
      [String(head.attempt), actorId, marker, head.slot, hotRows],
    );
    // Later sentinels must not be hidden by the hot task's 10,000 valid rows.
    for (const [entity, record, slot, action] of [
      ["subscription-campaign-mock-attempts", head.attempt, targets[1].slot, "review-mock-attempt"],
      ["subscription-campaign-mock-attempts", targets[1].attempt, head.slot, "review-mock-attempt"],
      ["other-entity", head.attempt, head.slot, "review-mock-attempt"],
      ["subscription-campaign-mock-attempts", head.attempt, head.slot, "not-visible"],
    ] as const)
      await db.query(
        `INSERT INTO audit_events
      (entity,record_id,actor_id,action,fields,"after",created_at) VALUES
      ($1,$2,$3,$4,$5,jsonb_build_object('slotId',$6::int),'2099-12-31T23:59:59Z')`,
        [entity, String(record), actorId, action, marker, slot],
      );
    await db.query("ANALYZE audit_events");
    assert.equal(
      (await db.query("SELECT count(*)::int AS count FROM audit_events WHERE fields=$1", [marker]))
        .rows[0].count,
      noiseRows + hotRows + 25 + 4,
    );
    const before = await databaseFingerprints(db);
    const observed = await observePGQueries(p, () => readCampaignReviewDetails(p, actor, input));
    assert.equal(observed.statements.length, 1, "large-table detail read must use one audit query");
    assert.equal(observed.result.rows.length, 25);
    assert.ok(
      observed.result.rows.every((row) => row.events.length > 0),
      "each task keeps its own audit history",
    );
    assert.doesNotMatch(
      JSON.stringify(observed.result),
      /PERF_PRIVATE|review-performance|token|hash|body|recipient|subscription|@/i,
    );
    const batch = observed.statements[0];
    // Exact PR108 per-task predicate, independent of the production batch builder.
    const legacy = targets.map((target): ObservedStatement => ({
      text: `SELECT action,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS at
        FROM audit_events WHERE "after"->>'slotId'=$1 AND (
          (entity='subscription-campaign-mock-leases' AND record_id=$2
            AND action IN ('claim-mock-task','recover-mock-task')) OR
          (entity='subscription-campaign-mock-attempts' AND record_id=$3
            AND action IN ('begin-mock-attempt','outcome-mock-attempt','review-mock-attempt'))
        ) ORDER BY id DESC LIMIT 21`,
      values: [String(target.slot), String(target.lease), String(target.attempt)],
    }));
    const execute = (statement: ObservedStatement) => db.query(statement.text, statement.values);
    const bounded = (await execute(batch)).rows;
    const groupSizes = new Map<number, number>();
    for (const event of bounded)
      groupSizes.set(Number(event.slotId), (groupSizes.get(Number(event.slotId)) ?? 0) + 1);
    assert.equal(groupSizes.size, 25, "SQL must return audits for every selected task");
    assert.equal(groupSizes.get(head.slot), 21, "SQL bounds the hot task before returning rows");
    assert.ok(
      [...groupSizes.values()].every((size) => size <= 21),
      "SQL bounds each task independently",
    );
    const runLegacy = async () => {
      const rows = [];
      for (const [index, statement] of legacy.entries()) {
        const events = (await execute(statement)).rows;
        rows.push({
          slotId: targets[index].slot,
          hasOlderEvents: events.length > 20,
          events: events.slice(0, 20).reverse(),
        });
      }
      return rows;
    };
    assert.deepEqual(
      observed.result.rows.map(({ slotId, events, hasOlderEvents }) => ({
        slotId,
        events,
        hasOlderEvents,
      })),
      await runLegacy(),
      "batch results must match legacy ordering and per-task truncation on the large table",
    );
    await runLegacy();
    await execute(batch);
    const legacyMs: number[] = [],
      batchMs: number[] = [],
      serviceMs: number[] = [];
    const timed = async (run: () => Promise<unknown>, samples: number[]) => {
      const start = performance.now();
      await run();
      samples.push(performance.now() - start);
    };
    for (let i = 0; i < 5; i++) {
      if (i % 2 === 0) {
        await timed(runLegacy, legacyMs);
        await timed(() => execute(batch), batchMs);
      } else {
        await timed(() => execute(batch), batchMs);
        await timed(runLegacy, legacyMs);
      }
      await timed(() => readCampaignReviewDetails(p, actor, input), serviceMs);
    }
    const explain = async (statement: ObservedStatement): Promise<Plan> =>
      (
        await db.query(
          "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + statement.text,
          statement.values,
        )
      ).rows[0]["QUERY PLAN"][0];
    const batchPlan = await explain(batch),
      legacyPlans: Plan[] = [];
    for (const statement of legacy) legacyPlans.push(await explain(statement));
    const batchWork = work([batchPlan]),
      legacyWork = work(legacyPlans);
    assert.equal(batchWork.scans, 1, "batch query must scan the audit relation once");
    assert.equal(legacyWork.scans, 25);
    assert.ok(
      batchWork.sharedBlocks < legacyWork.sharedBlocks,
      "batch query must reduce audit buffer work",
    );
    assert.deepEqual(
      await databaseFingerprints(db),
      before,
      "large-table reads and EXPLAIN never change business tables",
    );
    console.log(
      "PERF review-audits " +
        JSON.stringify({
          noiseRows,
          hotRows,
          targetRows: 25,
          samples: 5,
          legacyMedianMs: median(legacyMs),
          batchMedianMs: median(batchMs),
          serviceMedianMs: median(serviceMs),
          legacySamplesMs: legacyMs,
          batchSamplesMs: batchMs,
          serviceSamplesMs: serviceMs,
          legacy: legacyWork,
          batch: batchWork,
        }),
    );
    console.log(
      "PERF_PLAN review-audits " + JSON.stringify({ batch: batchPlan, legacy: legacyPlans }),
    );
  } finally {
    await db.query("DELETE FROM audit_events WHERE fields=$1 AND actor_id=$2", [marker, actorId]);
    assert.equal(
      (await db.query("SELECT count(*)::int AS count FROM audit_events WHERE fields=$1", [marker]))
        .rows[0].count,
      0,
    );
    await db.query("ANALYZE audit_events");
  }
}
