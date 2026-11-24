import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Payload } from "payload";
import type pg from "pg";
import type { Staff } from "../../src/cms/access";
import { campaignAudience } from "../../src/server/subscription-campaign-audience";
import { withCampaignDraft } from "../../src/server/subscription-campaign-drafts";
import { readCampaignRevisionPreflight } from "../../src/server/subscription-campaign-revision-preflight";
import { databaseFingerprints } from "./database-fingerprints";
import { observeCampaignAudience } from "./campaign-audience-queries";

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
  let scans = 0;
  const visit = (node: PlanNode) => {
    if (node["Relation Name"] === "subscriptions")
      scans += node["Parallel Aware"] ? 1 : (node["Actual Loops"] ?? 0);
    node.Plans?.forEach(visit);
  };
  plans.forEach((plan) => visit(plan.Plan));
  return {
    scans,
    sharedBlocks: plans.reduce(
      (n, plan) =>
        n + (plan.Plan["Shared Hit Blocks"] ?? 0) + (plan.Plan["Shared Read Blocks"] ?? 0),
      0,
    ),
  };
};

export async function assertPreflightAudiencePerformance(
  p: Payload,
  db: pg.Client,
  actor: Staff,
  input: { campaignKey: string; revision: number },
  expectedCounts: Awaited<ReturnType<typeof readCampaignRevisionPreflight>>["counts"],
  readHTTP: () => Promise<Response>,
) {
  const marker = "preflight-audience:" + randomUUID();
  const privacy = process.env.PRIVACY_VERSION!;
  const beforeFixture = await readCampaignRevisionPreflight(p, actor, input);
  try {
    await db.query(
      `INSERT INTO subscriptions
      (email,topic,locale,status,consent_version,consented_at,confirmed_at,privacy_version,source_path)
      SELECT 'large-'||i||'-'||$1||'@example.invalid','policy-updates',
        CASE WHEN i%5=1 THEN 'zh' ELSE 'en' END::enum_subscriptions_locale,
        CASE WHEN i%5=2 THEN 'pending' WHEN i%5=3 THEN 'unsubscribed' ELSE 'confirmed' END::enum_subscriptions_status,
        1,statement_timestamp(),CASE WHEN i%5 IN(2,3) THEN NULL ELSE statement_timestamp() END,
        CASE WHEN i%5=4 THEN 'old-'||$2 ELSE $2 END,$1
      FROM generate_series(1,100000) i`,
      [marker, privacy],
    );
    // Latest normalized email wins: a newer pending row shadows an older confirmation.
    // Raw SQL is intentional for legacy whitespace/case/invalid data that normal writes normalize.
    for (const [email, status, locale, seconds] of [
      [` Shadow-${marker}@example.invalid `, "confirmed", "en", 2],
      [`shadow-${marker}@example.invalid`, "pending", "en", 1],
      [` Winner-${marker}@example.invalid `, "unsubscribed", "en", 2],
      [`winner-${marker}@example.invalid`, "confirmed", "en", 1],
      [`french-${marker}@example.invalid`, "confirmed", "fr", 1],
      [`invalid-${marker}`, "confirmed", "en", 1],
    ] as const)
      await db.query(
        `INSERT INTO subscriptions
        (email,topic,locale,status,consent_version,consented_at,confirmed_at,privacy_version,source_path)
        VALUES($1,'policy-updates',$2,$3::enum_subscriptions_status,1,statement_timestamp()-$4::int*interval '1 second',
          CASE WHEN $3::enum_subscriptions_status='confirmed' THEN statement_timestamp() ELSE NULL END,$5,$6)`,
        [email, locale, status, seconds, privacy, marker],
      );
    assert.equal(
      (
        await db.query("SELECT count(*)::int AS n FROM subscriptions WHERE source_path=$1", [
          marker,
        ])
      ).rows[0].n,
      100006,
    );
    await db.query("ANALYZE subscriptions");
    const before = await databaseFingerprints(db);
    const observed = await observeCampaignAudience(p, () =>
      readCampaignRevisionPreflight(p, actor, input),
    );
    assert.equal(observed.statements.length, 1, "large preflight must use one audience query");
    assert.deepEqual(
      observed.result.counts,
      expectedCounts,
      "later subscribers cannot extend original frozen jobs",
    );
    assert.deepEqual(observed.result.blockers, beforeFixture.blockers);
    assert.equal(observed.result.total, 10);
    const response = await readHTTP();
    assert.equal(response.status, 200);
    const receipt = (await response.json()).preflight;
    assert.deepEqual(receipt.counts, expectedCounts);
    assert.deepEqual(receipt.blockers, beforeFixture.blockers);
    assert.doesNotMatch(
      JSON.stringify(receipt),
      /@|email|hash|token|audience|subscription|jobId|slotId|subject|body/i,
    );

    const twice: number[] = [],
      once: number[] = [],
      service: number[] = [];
    await withCampaignDraft(
      p,
      actor,
      input.campaignKey,
      input.revision,
      async (req, _draft, snapshot, read) => {
        // 20k zh + 20k en + winner en + french; the 11 pre-existing confirmed rows are en.
        assert.deepEqual(snapshot.counts, { zh: 20000, en: 20012, excluded: 1 });
        const shared = await observeCampaignAudience(p, async () => [await read(), await read()]);
        assert.equal(
          shared.statements.length,
          0,
          "snapshot and repeated consumers reuse the same normalized list",
        );
        assert.strictEqual(shared.result[0], shared.result[1]);
        assert.equal(shared.result[0].length, 40013);
        assert.equal(
          shared.result[0].filter((row) => row.email === `shadow-${marker}@example.invalid`).length,
          0,
        );
        assert.equal(
          shared.result[0].filter((row) => row.email === `winner-${marker}@example.invalid`).length,
          1,
        );
        async function sample(calls: number) {
          const start = performance.now();
          let latest: Awaited<ReturnType<typeof campaignAudience>> = [];
          for (let i = 0; i < calls; i++) latest = await campaignAudience(p, req);
          const elapsed = performance.now() - start;
          assert.deepEqual(latest, shared.result[0]);
          return elapsed;
        }
        await sample(2);
        await sample(1);
        for (let i = 0; i < 5; i++) {
          if (i % 2 === 0) {
            twice.push(await sample(2));
            once.push(await sample(1));
          } else {
            once.push(await sample(1));
            twice.push(await sample(2));
          }
        }
      },
    );
    for (let i = 0; i < 5; i++) {
      const sample = await observeCampaignAudience(p, () =>
        readCampaignRevisionPreflight(p, actor, input),
      );
      assert.equal(sample.statements.length, 1);
      assert.deepEqual(sample.result.counts, expectedCounts);
      service.push(sample.elapsedMs);
    }
    const statement = observed.statements[0];
    const explain = async (): Promise<Plan[]> =>
      (
        await db.query(
          "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + statement.text,
          statement.values,
        )
      ).rows[0]["QUERY PLAN"];
    const legacy = [...(await explain()), ...(await explain())];
    const current = await explain();
    const oldWork = work(legacy),
      newWork = work(current);
    assert.equal(oldWork.scans, 2);
    assert.equal(newWork.scans, 1);
    assert.ok(newWork.sharedBlocks < oldWork.sharedBlocks);
    assert.deepEqual(
      await databaseFingerprints(db),
      before,
      "all measured reads and plans leave every table unchanged",
    );
    console.log(
      "PERF preflight-audience " +
        JSON.stringify({
          addedSubscriptions: 100006,
          eligibleRows: 40013,
          runtime: {
            node: process.version,
            arch: process.arch,
            postgres: (await db.query("SHOW server_version")).rows[0].server_version,
          },
          samples: 5,
          twiceMedianMs: median(twice),
          onceMedianMs: median(once),
          serviceMedianMs: median(service),
          twiceSamplesMs: twice,
          onceSamplesMs: once,
          serviceSamplesMs: service,
          oldWork,
          newWork,
        }),
    );
    console.log("PERF_PLAN preflight-audience " + JSON.stringify({ legacy, current }));
  } finally {
    await db.query("DELETE FROM subscriptions WHERE source_path=$1", [marker]);
    assert.equal(
      (
        await db.query("SELECT count(*)::int AS n FROM subscriptions WHERE source_path=$1", [
          marker,
        ])
      ).rows[0].n,
      0,
    );
  }
  const after = await readCampaignRevisionPreflight(p, actor, input);
  assert.deepEqual(after.counts, beforeFixture.counts);
  assert.deepEqual(after.blockers, beforeFixture.blockers);
}
