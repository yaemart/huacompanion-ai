import type pg from "pg";
import type { readCleanupScope } from "../../scripts/lib/policy-demo-cleanup";
import { databaseFingerprints } from "./database-fingerprints";
const quote = (s: string) => `"${s.replaceAll('"', '""')}"`;
export async function protectedDemoData(
  c: pg.Client,
  scope: Awaited<ReturnType<typeof readCleanupScope>>,
  baseline?: Awaited<ReturnType<typeof databaseFingerprints>>,
) {
  const tables = baseline || (await databaseFingerprints(c));
  const rows = [];
  for (const t of tables) {
    const excluded = scope.rows[t.table]?.map((r) => r.id) || [];
    const appendOnly = ["audit_events", "payload_migrations"].includes(t.table);
    const beforeCount = appendOnly ? Number(t.count) : 0;
    const fields = t.columns.map(quote).join(",");
    const values: unknown[] = [appendOnly ? beforeCount : excluded];
    const condition = appendOnly ? "ORDER BY id LIMIT $1" : "WHERE NOT (id=ANY($1))";
    const digest = (
      await c.query(
        `SELECT md5(coalesce(string_agg(row_hash,'' ORDER BY row_hash),'')) hash,count(*)::text count FROM (SELECT md5(to_jsonb(t)::text) row_hash
       FROM (SELECT ${fields} FROM ${quote(t.table)} ${condition}) t) h`,
        values,
      )
    ).rows[0];
    rows.push({ ...t, ...digest });
  }
  return rows;
}
