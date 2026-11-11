import assert from "node:assert/strict";
import pg from "pg";
import type { MigrateUpArgs } from "@payloadcms/db-postgres";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { up, down } from "../../src/migrations/20261111_100000_quote_templates";
import { databaseFingerprints } from "../helpers/database-fingerprints";

const url = new URL(process.env.DATABASE_URL || "");
assert.equal(process.env.APP_ENV, "local");
assert.equal(url.hostname, "127.0.0.1");
assert.ok(
  (url.port === "55442" && /^\/hua_quote_templates_[a-f0-9]{32}$/.test(url.pathname)) ||
    (url.port === "55438" && url.pathname === "/hua_companion" && process.env.CI === "true"),
);
const db = new pg.Client({ connectionString: url.toString() });
await db.connect();
const args = { db: { execute: (sql: string) => db.query(sql) } } as unknown as MigrateUpArgs;
try {
  const baseline = (await databaseFingerprints(db)).filter(
    ({ table }) =>
      !["quote_template_settings", "quote_template_settings_templates"].includes(table),
  );
  const existing = await db.query("SELECT to_regclass('public.quote_template_settings') AS name");
  if (existing.rows[0].name) await down(args);
  await up(args);
  await down(args);
  await up(args);
  assert.deepEqual(await databaseFingerprints(db, baseline), baseline);

  const parent = await db.query("INSERT INTO quote_template_settings DEFAULT VALUES RETURNING id");
  const id: number = parent.rows[0].id;
  await db.query(
    "INSERT INTO quote_template_settings_templates " +
      "(_order,_parent_id,id,category,enabled,included,excluded,terms) " +
      "VALUES (1,$1,'migration-test','business',false,'fixture','fixture','fixture')",
    [id],
  );
  await assert.rejects(() => down(args), /Preserve configured quote templates/);
  assert.equal(
    (
      await db.query("SELECT enabled FROM quote_template_settings_templates WHERE _parent_id=$1", [
        id,
      ])
    ).rows[0].enabled,
    false,
  );
  await db.query("DELETE FROM quote_template_settings WHERE id=$1", [id]);
  const p = await getPayload({ config });
  try {
    const save = (included: string) =>
      p.updateGlobal({
        slug: "quote-template-settings",
        data: { templates: [{ category: "business", included, excluded: "No", terms: "Terms" }] },
      });
    await Promise.all([save("First"), save("Second")]);
    const count = await db.query("SELECT count(*)::int AS n FROM quote_template_settings");
    assert.equal(count.rows[0].n, 1, "concurrent first saves must share one settings row");
    await p.updateGlobal({ slug: "quote-template-settings", data: { templates: [] } });
  } finally {
    await p.destroy();
  }
  console.log(
    `PASS migration round-trip preserves ${baseline.length} tables; configured rollback rejected`,
  );
} finally {
  await db.end();
}
process.exit(0);
