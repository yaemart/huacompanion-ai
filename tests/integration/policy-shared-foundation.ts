import "dotenv/config";
import assert from "node:assert/strict";
import pg from "pg";
import { getPayload } from "payload";
import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";
import config from "../../src/payload.config";
import { up, down } from "../../src/migrations/20261108_140000_policy_shared_foundation";
import {
  up as taskUp,
  down as taskDown,
} from "../../src/migrations/20261108_160000_policy_note_tasks";
import { databaseFingerprints } from "../helpers/database-fingerprints";
import { contentTransaction } from "../../src/server/content/service";
const url = new URL(process.env.DATABASE_URL || "");
const clone = url.port === "55442" && /^\/hua_policy_c[12345]_[a-f0-9]{32}$/.test(url.pathname);
const ci = process.env.CI === "true" && url.port === "55438" && url.pathname === "/hua_companion";
if (process.env.APP_ENV !== "local" || url.hostname !== "127.0.0.1" || (!clone && !ci))
  throw Error("Only disposable shared-policy clone or CI is allowed");
const pool = new pg.Pool({ connectionString: url.toString(), max: 1 });
const client = await pool.connect();
const args = {
  db: { execute: (statement: string) => client.query(statement) },
} as unknown as MigrateUpArgs;
const tables = [
  "policy_groups",
  "policy_fact_drafts",
  "policy_fact_versions",
  "policy_note_drafts",
  "policy_note_versions",
];
let baseline: Awaited<ReturnType<typeof databaseFingerprints>>;
const facts = {
  countryCode: "XY",
  countryNameEn: "Fictional",
  countryNameZh: "虚构国家",
  policyType: "unilateral",
  maximumStay: 30,
  stayUnit: "days",
  validFrom: "2026-01-01",
  validUntil: null,
  officialSourceUrl: "https://example.invalid/policy",
  portsAndRegions: ["fictional"],
  lastVerifiedOn: "2026-01-01",
  verifiedBy: 1,
  internalNotes: "private",
};
try {
  const taskRelation = !!(
    await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='workflow_tasks' AND column_name='policy_group_id'",
    )
  ).rowCount;
  if (taskRelation) await taskDown(args as unknown as MigrateDownArgs);
  if ((await client.query("SELECT to_regclass('policy_groups') AS name")).rows[0].name)
    await down(args as unknown as MigrateDownArgs);
  const before = await databaseFingerprints(client);
  baseline = before;
  await up(args);
  assert.deepEqual(await databaseFingerprints(client, before), before);
  await down(args as unknown as MigrateDownArgs);
  assert.deepEqual(await databaseFingerprints(client), before);
  await up(args);
  assert.deepEqual(await databaseFingerprints(client, before), before);
  console.log(
    `PASS up/down/up preserves ${before.length} existing tables and old policy snapshots`,
  );
  await client.query("BEGIN");
  async function refused(sql: string, values: unknown[] = []) {
    await client.query("SAVEPOINT expected_failure");
    await assert.rejects(() => client.query(sql, values));
    await client.query("ROLLBACK TO SAVEPOINT expected_failure");
  }
  const createGroup = async (key: string) =>
    (await client.query("INSERT INTO policy_groups(content_key) VALUES ($1) RETURNING id", [key]))
      .rows[0].id;
  const a = await createGroup("c1-a"),
    b = await createGroup("c1-b");
  await refused("INSERT INTO policy_groups(content_key) VALUES ('c1-a')");
  await refused("INSERT INTO policy_groups(content_key,revision) VALUES ('c1-invalid',0.5)");
  await client.query("INSERT INTO policy_fact_drafts(group_id,facts) VALUES ($1,'{}')", [a]);
  await refused("INSERT INTO policy_fact_drafts(group_id,facts) VALUES ($1,'{}')", [a]);
  const version = (
    await client.query(
      `INSERT INTO policy_fact_versions(group_id,revision,source_revision,facts,approved_by,contributors)
    VALUES ($1,1,1,$2,1,'[]') RETURNING id`,
      [a, facts],
    )
  ).rows[0].id;
  await refused(
    `INSERT INTO policy_fact_versions(group_id,revision,source_revision,facts,approved_by,contributors)
    VALUES ($1,1,1,'{}',1,'[]')`,
    [a],
  );
  await client.query("UPDATE policy_groups SET active_fact_version_id=$1 WHERE id=$2", [
    version,
    a,
  ]);
  await refused("UPDATE policy_groups SET active_fact_version_id=$1 WHERE id=$2", [version, b]);
  for (const action of [
    "UPDATE policy_fact_versions SET revision=2 WHERE id=$1",
    "DELETE FROM policy_fact_versions WHERE id=$1",
  ])
    await refused(action, [version]);
  const note = (
    await client.query(
      `INSERT INTO policy_note_versions(group_id,locale,revision,title,slug,public_notes,
    based_on_fact_version_id,source_revision,approved_by,contributors) VALUES ($1,'zh',1,'虚构','c1-a','note',$2,1,1,'[]') RETURNING id`,
      [a, version],
    )
  ).rows[0].id;
  await refused(
    `INSERT INTO policy_note_versions(group_id,locale,revision,title,slug,based_on_fact_version_id,source_revision,approved_by,contributors)
    VALUES ($1,'zh',1,'x','x',$2,1,1,'[]')`,
    [b, version],
  );
  for (const action of [
    "UPDATE policy_note_versions SET public_notes='changed' WHERE id=$1",
    "DELETE FROM policy_note_versions WHERE id=$1",
  ])
    await refused(action, [note]);
  await client.query(
    `INSERT INTO policy_note_drafts(group_id,locale,title,slug,based_on_fact_version_id,published_note_version_id)
    VALUES ($1,'zh','虚构','c1-a',$2,$3)`,
    [a, version, note],
  );
  await refused(
    `INSERT INTO policy_note_drafts(group_id,locale,title,slug,published_note_version_id)
    VALUES ($1,'en','x','x',$2)`,
    [a, note],
  );
  await refused(
    `INSERT INTO policy_note_drafts(group_id,locale,title,slug,based_on_fact_version_id)
    VALUES ($1,'en','x','x',$2)`,
    [b, version],
  );
  await refused(
    `INSERT INTO policy_note_drafts(group_id,locale,title,slug) VALUES ($1,'zh','x','x')`,
    [a],
  );
  await refused(
    `INSERT INTO policy_note_drafts(group_id,locale,title,slug) VALUES ($1,'fr','x','x')`,
    [b],
  );
  await client.query("SAVEPOINT down_guard");
  await assert.rejects(() => down(args as unknown as MigrateDownArgs), /data|数据/i);
  await client.query("ROLLBACK TO SAVEPOINT down_guard");
  assert.ok((await client.query("SELECT count(*)::int n FROM policy_fact_versions")).rows[0].n);
  await client.query("ROLLBACK");
  assert.deepEqual(await databaseFingerprints(client, before), before);
  if (taskRelation) await taskUp(args);
  console.log(
    "PASS unique drafts/versions, same-group/language pointers, SQL immutability and nonempty rollback guard",
  );
} finally {
  await client.query("ROLLBACK");
  client.release();
  await pool.end();
}
const p = await getPayload({ config });
try {
  const probe = new pg.Client({ connectionString: url.toString() });
  await probe.connect();
  let apiBaseline: typeof baseline;
  try {
    apiBaseline = await databaseFingerprints(probe, baseline!);
    // Dev push updates its own migration marker; all business rows must stay unchanged.
    assert.deepEqual(
      apiBaseline.filter((r) => r.table !== "payload_migrations"),
      baseline!.filter((r) => r.table !== "payload_migrations"),
    );
    assert.equal(
      (
        await probe.query(
          "SELECT count(*)::int n FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE 'policy_shared_%'",
        )
      ).rows[0].n,
      7,
    );
  } finally {
    await probe.end();
  }
  const people = (await p.find({ collection: "staff", pagination: false, depth: 0 })).docs;
  const admin = people.find((x) => x.active !== false && x.role === "admin");
  assert.ok(admin);
  const collections = [
    "policy-groups",
    "policy-fact-drafts",
    "policy-fact-versions",
    "policy-note-drafts",
    "policy-note-versions",
  ] as const;
  for (const collection of ["policy-fact-versions", "policy-note-versions"] as const) {
    for (const operation of ["update", "delete", "bulk"] as const) {
      await assert.rejects(
        () =>
          contentTransaction(p, async (req) => {
            const group = await p.create({
              collection: "policy-groups",
              data: { contentKey: "c1-api", revision: 1 },
              req,
            });
            const fact = await p.create({
              collection: "policy-fact-versions",
              data: {
                group: group.id,
                revision: 1,
                sourceRevision: 1,
                facts: { ...facts, verifiedBy: admin.id },
                approvedBy: admin.id,
                contributors: [admin.id],
              },
              req,
            });
            const note = await p.create({
              collection: "policy-note-versions",
              data: {
                group: group.id,
                locale: "zh",
                revision: 1,
                title: "虚构",
                slug: "c1-api",
                publicNotes: "虚构说明",
                basedOnFactVersion: fact.id,
                sourceRevision: 1,
                approvedBy: admin.id,
                contributors: [admin.id],
              },
              req,
            });
            const id = collection === "policy-fact-versions" ? fact.id : note.id;
            if (operation === "update")
              await p.update({ collection, id, data: { revision: 2 }, req });
            else if (operation === "delete") await p.delete({ collection, id, req });
            else {
              const result = await p.update({
                collection,
                where: { id: { equals: id } },
                data: { revision: 2 },
                req,
              });
              assert.equal(result.docs.length, 0);
              assert.equal(result.errors.length, 1);
              throw Error("C1_BULK_REFUSED");
            }
          }),
        operation === "update"
          ? /不可修改/
          : operation === "delete"
            ? /不可删除/
            : /C1_BULK_REFUSED/,
      );
    }
  }
  const deniedUsers = [
    null,
    { ...admin, active: false },
    ...(["manager", "operations", "editor", "reviewer"] as const).map((role) => ({
      ...admin,
      role,
      additionalRoles: [],
    })),
  ];
  for (const user of deniedUsers) {
    for (const collection of collections)
      await assert.rejects(() => p.find({ collection, user, overrideAccess: false }));
  }
  await assert.rejects(() =>
    p.create({
      collection: "policy-groups",
      data: { contentKey: "c1-forbidden", revision: 1 },
      user: admin,
      overrideAccess: false,
    }),
  );
  await assert.rejects(
    () =>
      contentTransaction(p, async (req) => {
        const group = await p.create({
          collection: "policy-groups",
          data: { contentKey: "c1-default", revision: 1 },
          req,
        });
        const draft = await p.create({
          collection: "policy-note-drafts",
          draft: true,
          data: {
            group: group.id,
            locale: "zh",
            title: "虚构",
            slug: "c1-default",
          },
          req,
        });
        assert.equal(draft.needsReview, true);
        throw Error("C1_FIXTURE_ROLLBACK");
      }),
    /C1_FIXTURE_ROLLBACK/,
  );
  for (const collection of [
    "policy-groups",
    "policy-fact-drafts",
    "policy-fact-versions",
    "policy-note-drafts",
    "policy-note-versions",
  ] as const)
    assert.equal((await p.count({ collection })).totalDocs, 0);
  const check = new pg.Client({ connectionString: url.toString() });
  await check.connect();
  try {
    assert.deepEqual(await databaseFingerprints(check, apiBaseline!), apiBaseline!);
  } finally {
    await check.end();
  }
  assert.equal(tables.length, 5);
  console.log(
    "PASS closed direct collection access, Payload version immutability and needs-review default; all fixtures rolled back",
  );
} finally {
  await p.destroy();
}
process.exit(0);
