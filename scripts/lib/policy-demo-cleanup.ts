import assert from "node:assert/strict";
import type pg from "pg";
const policies = [1, 2, 3, 4, 5, 6, 7, 8];
const drafts = [18, 19, 20, 21, 39, 40, 41, 42];
const targets: Record<string, [string, number[], number[] | null]> = {
  _imm_policies_v_version_ports_and_regions: [
    "_parent_id",
    Array.from({ length: 14 }, (_, i) => i + 1),
    Array.from({ length: 14 }, (_, i) => i + 1),
  ],
  imm_policies_ports_and_regions: ["_parent_id", policies, null],
  _content_drafts_v: [
    "parent_id",
    drafts,
    [
      ...Array.from({ length: 11 }, (_, i) => i + 51),
      ...Array.from({ length: 11 }, (_, i) => i + 112),
    ],
  ],
  _imm_policies_v: ["parent_id", policies, Array.from({ length: 14 }, (_, i) => i + 1)],
  content_published: ["draft_id", drafts, [17, 18, 19, 36, 37, 38]],
  content_events: ["draft_id", drafts, [17, 18, 19, 36, 37, 38]],
  content_quality: ["draft_id", drafts, drafts],
  content_drafts: ["id", drafts, drafts],
  imm_policies: ["id", policies, policies],
};
const quote = (s: string) => `"${s.replaceAll('"', '""')}"`;
type Rows = Record<string, Record<string, unknown>[]>;
export async function readCleanupScope(c: pg.Client) {
  const rows: Rows = {};
  if ((await c.query("SELECT to_regclass('policy_groups') name")).rows[0].name)
    assert.equal(
      (await c.query("SELECT count(*)::int n FROM policy_groups")).rows[0].n,
      0,
      "发现新结构政策，清单需重新确认",
    );
  for (const [table, [column, ids, expected]] of Object.entries(targets)) {
    rows[table] = (
      await c.query(
        `SELECT * FROM ${quote(table)} WHERE ${quote(column)}=ANY($1::int[]) ORDER BY id`,
        [ids],
      )
    ).rows;
    if (expected)
      assert.deepEqual(
        rows[table].map((r) => r.id),
        expected,
        "清单ID变化，停止清理",
      );
    else assert.equal(rows[table].length, 8, "口岸清单变化");
  }
  assert.deepEqual(
    (await c.query("SELECT id FROM imm_policies ORDER BY id")).rows.map((r) => r.id),
    policies,
    "政策清单变化",
  );
  assert.deepEqual(
    (
      await c.query("SELECT id FROM content_drafts WHERE kind='immigration-policy' ORDER BY id")
    ).rows.map((r) => r.id),
    drafts,
    "工作稿清单变化",
  );
  for (const [i, r] of rows.imm_policies.entries()) {
    assert.equal(r.country_code, ["XY", "XZ", "XW", "XQ"][i % 4], "国家变化");
    assert.equal(r.official_source_url, "https://example.invalid/policy", "来源变化");
    assert.match(String(r.public_notes), /演示|fictional|demo/i, "非虚构说明");
  }
  for (const [table, field] of [
    ["content_drafts", "body"],
    ["content_published", "body"],
    ["_content_drafts_v", "version_body"],
    ["content_events", "snapshot"],
  ]) {
    const extra = await c.query(
      `SELECT count(*)::int n FROM ${quote(table)} WHERE coalesce(${quote(field)}->>'kind','') <> 'immigration-policy'
       AND (jsonb_path_exists(${quote(field)}, '$.** ? (@.type == "policy-banner")')
       OR jsonb_path_exists(${quote(field)}, '$.**.policyRef'))`,
    );
    assert.equal(extra.rows[0].n, 0, "发现额外政策引用，停止清理");
  }
  const refs = (
    await c.query(
      `SELECT k.conrelid::regclass::text child, a.attname col, k.confrelid::regclass::text parent FROM pg_constraint k
       JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=k.conkey[1]
       WHERE k.contype='f' AND array_length(k.conkey,1)=1`,
    )
  ).rows;
  for (const ref of refs) {
    if (!rows[ref.parent]) continue;
    const found = (
      await c.query(`SELECT id FROM ${quote(ref.child)} WHERE ${quote(ref.col)}=ANY($1)`, [
        rows[ref.parent].map((r) => r.id),
      ])
    ).rows;
    assert.ok(
      found.every((r) => rows[ref.child]?.some((allowed) => allowed.id === r.id)),
      "发现未批准的关联，停止清理",
    );
  }
  for (const table of [
    "content_quality_events",
    "workflow_tasks",
    "workflow_events",
    "workflow_notifications",
  ]) {
    const column = table === "content_quality_events" ? "draft_id" : "content_draft_id";
    const exists = (
      await c.query(
        "SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2",
        [table, column],
      )
    ).rowCount;
    if (exists)
      assert.equal(
        (
          await c.query(
            `SELECT count(*)::int n FROM ${quote(table)} WHERE ${quote(column)}=ANY($1::int[])`,
            [drafts],
          )
        ).rows[0].n,
        0,
        "新增复核关联",
      );
  }
  return JSON.parse(JSON.stringify({ rows })) as { rows: Rows };
}
export async function cleanupPolicyDemo(
  c: pg.Client,
  approved: Awaited<ReturnType<typeof readCleanupScope>>,
  actor: number,
) {
  await c.query("BEGIN");
  try {
    await c.query("SELECT pg_advisory_xact_lock(726271)");
    const target = (
      await c.query(
        "SELECT current_database() name, host(inet_server_addr()) host, inet_server_port() port",
      )
    ).rows[0];
    if (
      target.host !== "127.0.0.1" ||
      target.port !== 55442 ||
      (target.name !== "hua_companion_demo" && !/^hua_policy_c6_[a-f0-9]{32}$/.test(target.name))
    )
      throw Error("仅允许本机演示库或C6克隆");
    assert.equal(
      (
        await c.query(
          "SELECT count(*)::int n FROM staff WHERE id=$1 AND role='admin' AND active=true",
          [actor],
        )
      ).rows[0].n,
      1,
      "仅有效管理员可清理",
    );
    const done = (
      await c.query(
        "SELECT id FROM audit_events WHERE entity='policy-demo-cutover' AND record_id='approved-eight-v1' AND action='cleanup'",
      )
    ).rowCount;
    if (done) {
      assert.equal(
        (await c.query("SELECT count(*)::int n FROM imm_policies")).rows[0].n,
        0,
        "清理后出现旧政策，停止",
      );
      assert.equal(
        (
          await c.query(
            "SELECT count(*)::int n FROM content_drafts WHERE kind='immigration-policy'",
          )
        ).rows[0].n,
        0,
        "清理后出现旧稿",
      );
      await c.query("COMMIT");
      return "already-cleaned";
    }
    assert.deepEqual(await readCleanupScope(c), approved, "清单正文或关联变化，停止清理");
    for (const [table, records] of Object.entries(approved.rows)) {
      const result = await c.query(`DELETE FROM ${quote(table)} WHERE id=ANY($1) RETURNING id`, [
        records.map((r) => r.id),
      ]);
      assert.equal(result.rowCount, records.length, "删除数量与批准清单不符");
    }
    await c.query(
      'INSERT INTO audit_events(entity,record_id,action,actor_id,"before","after") VALUES($1,$2,$3,$4,$5,$6)',
      [
        "policy-demo-cutover",
        "approved-eight-v1",
        "cleanup",
        actor,
        JSON.stringify(approved),
        JSON.stringify({ rebuilt: false }),
      ],
    );
    await c.query("COMMIT");
    return "cleaned";
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  }
}
