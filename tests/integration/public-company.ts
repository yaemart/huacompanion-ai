import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import pg from "pg";
import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";
import { up, down } from "../../src/migrations/20261108_220000_public_company";
import { up as addCollectionSetting } from "../../src/migrations/20261113_110000_quote_line_review";
import { up as addQuoteCopySettings } from "../../src/migrations/20261113_120000_quote_customer_copy";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { publicCompany } from "../../src/lib/public-company";
const url = new URL(process.env.DATABASE_URL || "");
const clone = url.port === "55442" && /^\/hua_client_d3_[a-f0-9]{32}$/.test(url.pathname);
const ci = process.env.CI === "true" && url.port === "55438" && url.pathname === "/hua_companion";
if (process.env.APP_ENV !== "local" || url.hostname !== "127.0.0.1" || (!clone && !ci))
  throw Error("Disposable D3 clone or CI only");
const pool = new pg.Pool({ connectionString: url.toString(), max: 1 });
const client = await pool.connect();
const args = { db: { execute: (sql: string) => client.query(sql) } } as unknown as MigrateUpArgs;
async function fingerprint() {
  const tables = (
    await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> 'public_company_settings' ORDER BY tablename",
    )
  ).rows;
  const hash = createHash("sha256");
  for (const { tablename } of tables) {
    const name = '"' + tablename.replaceAll('"', '""') + '"';
    const rows = await client.query(
      `SELECT row_to_json(t)::text v FROM ${name} t ORDER BY row_to_json(t)::text`,
    );
    hash.update(tablename + JSON.stringify(rows.rows));
  }
  return hash.digest("hex");
}
try {
  const before = await fingerprint();
  const exists = (await client.query("SELECT to_regclass('public.public_company_settings') t"))
    .rows[0].t;
  if (!exists) await up(args);
  const existing = (
    await client.query(
      "SELECT company_name, location_zh, location_en, email, phone, " +
        "quote_referral_notice, quote_managed_notice, quote_collection_notice FROM public_company_settings",
    )
  ).rows;
  assert.ok(
    existing.every((row) => Object.values(row).every((value) => !value)),
    "never remove configured fixture data",
  );
  await down(args as unknown as MigrateDownArgs);
  await up(args);
  await addCollectionSetting(args);
  await addQuoteCopySettings(args);
  assert.equal(await fingerprint(), before, "migration round-trip preserves every old row");
  console.log("PASS additive empty-table migration round-trip and old table fingerprints");
} finally {
  client.release();
  await pool.end();
}
const p = await getPayload({ config });
const admin = (
  await p.find({ collection: "staff", where: { role: { equals: "admin" } }, limit: 1 })
).docs[0];
assert.ok(admin);
const created: number[] = [];
try {
  await assert.rejects(() =>
    p.findGlobal({ slug: "public-company-settings", overrideAccess: false }),
  );
  await assert.rejects(() =>
    p.updateGlobal({
      slug: "public-company-settings",
      overrideAccess: false,
      data: { companyName: "Denied" },
    }),
  );
  for (const role of ["manager", "operations", "reviewer", "editor"] as const) {
    const user = await p.create({
      collection: "staff",
      user: admin,
      overrideAccess: false,
      data: {
        name: "Fictional company permission fixture",
        email: `${randomUUID()}@example.invalid`,
        password: randomBytes(24).toString("hex"),
        active: true,
        role,
      },
    });
    created.push(user.id);
    await assert.rejects(() =>
      p.findGlobal({ slug: "public-company-settings", user, overrideAccess: false }),
    );
    await assert.rejects(() =>
      p.updateGlobal({
        slug: "public-company-settings",
        user,
        overrideAccess: false,
        data: { companyName: "Denied" },
      }),
    );
  }
  const inactive = { ...admin, active: false };
  await assert.rejects(() =>
    p.findGlobal({ slug: "public-company-settings", user: inactive, overrideAccess: false }),
  );
  await assert.rejects(() =>
    p.updateGlobal({
      slug: "public-company-settings",
      user: inactive,
      overrideAccess: false,
      data: { companyName: "Denied" },
    }),
  );
  const saved = await p.updateGlobal({
    slug: "public-company-settings",
    user: admin,
    overrideAccess: false,
    data: {
      companyName: "DEMO · Fictional company",
      locationZh: "虚构测试地点",
      locationEn: "Fictional place",
      email: "demo@example.invalid",
      phone: "+00 000",
    },
  });
  const rollbackClient = new pg.Client({ connectionString: url.toString() });
  await rollbackClient.connect();
  try {
    await assert.rejects(
      () =>
        down({
          db: { execute: (sql: string) => rollbackClient.query(sql) },
        } as unknown as MigrateDownArgs),
      /Preserve configured/,
    );
  } finally {
    await rollbackClient.end();
  }
  assert.equal(publicCompany(saved, "en")?.location, "Fictional place");
  assert.equal(publicCompany(saved, "zh")?.location, "虚构测试地点");
  await assert.rejects(() =>
    p.updateGlobal({
      slug: "public-company-settings",
      user: admin,
      overrideAccess: false,
      data: { email: "javascript:alert(1)" },
    }),
  );
  const cleared = await p.updateGlobal({
    slug: "public-company-settings",
    user: admin,
    overrideAccess: false,
    data: {
      companyName: "",
      locationZh: "",
      locationEn: "",
      email: "",
      phone: "",
    },
  });
  assert.equal(publicCompany(cleared, "en"), null);
  console.log(
    "PASS anonymous/four non-admin roles/inactive admin denied; admin save, invalid email and clear",
  );
} finally {
  await p.updateGlobal({
    slug: "public-company-settings",
    data: { companyName: "", locationZh: "", locationEn: "", email: "", phone: "" },
  });
  for (const id of created)
    await p.update({
      collection: "staff",
      id,
      user: admin,
      overrideAccess: false,
      data: { active: false },
    });
  await p.destroy();
}
process.exit(0);
