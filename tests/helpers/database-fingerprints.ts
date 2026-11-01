import type pg from "pg";

type TableFingerprint = {
  table: string;
  columns: string[];
  count: string;
  hash: string;
};
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

/** Compare existing columns only, so an added nullable column does not hide row changes. */
export async function databaseFingerprints(
  db: Pick<pg.Pool, "query">,
  baseline?: TableFingerprint[],
): Promise<TableFingerprint[]> {
  const tables =
    baseline ||
    (
      await db.query<{ table: string }>(
        "SELECT tablename AS \"table\" FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
      )
    ).rows.map((row) => ({ ...row, columns: [], count: "", hash: "" }));
  const result: TableFingerprint[] = [];
  for (const row of tables) {
    const columns = row.columns.length
      ? row.columns
      : (
          await db.query<{ column_name: string }>(
            "SELECT column_name FROM information_schema.columns " +
              "WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",
            [row.table],
          )
        ).rows.map((column) => column.column_name);
    const digest = await db.query<{ count: string; hash: string }>(
      "SELECT count(*)::text AS count, " +
        "md5(coalesce(string_agg(row_hash,'' ORDER BY row_hash),'')) AS hash FROM " +
        `(SELECT md5(to_jsonb(t)::text) AS row_hash FROM ` +
        `(SELECT ${columns.map(quote).join(",")} FROM ${quote(row.table)}) t) hashes`,
    );
    result.push({ table: row.table, columns, ...digest.rows[0] });
  }
  return result;
}
