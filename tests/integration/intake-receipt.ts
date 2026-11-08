import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import pg from "pg";
import { getPayload } from "payload";
import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";
import config from "../../src/payload.config";
import { up, down } from "../../src/migrations/20261109_080000_inquiry_reply";
import { databaseFingerprints } from "../helpers/database-fingerprints";
import { publicInquiryReplies, defaultInquiryReplies } from "../../src/lib/intake-receipt";
const url = new URL(process.env.DATABASE_URL || "");
const clone = url.port === "55442" && /^\/hua_client_d9_[a-f0-9]{32}$/.test(url.pathname);
const ci = process.env.CI === "true" && url.port === "55438" && url.pathname === "/hua_companion";
if (process.env.APP_ENV !== "local" || url.hostname !== "127.0.0.1" || (!clone && !ci))
  throw Error("Disposable D9 clone or CI only");
const db = new pg.Pool({ connectionString: url.toString(), max: 1 });
const args = { db: { execute: (sql: string) => db.query(sql) } } as unknown as MigrateUpArgs;
try {
  const exists = (
    await db.query(
      "SELECT 1 FROM information_schema.columns WHERE table_name='workflow_settings' AND column_name='inquiry_reply_zh'",
    )
  ).rowCount;
  if (!exists) await up(args);
  const columns = (await databaseFingerprints(db)).map((row) => ({
    ...row,
    columns:
      row.table === "workflow_settings"
        ? row.columns.filter((name) => !["inquiry_reply_zh", "inquiry_reply_en"].includes(name))
        : row.columns,
  }));
  const baseline = await databaseFingerprints(db, columns);
  const originals = (
    await db.query("SELECT id,inquiry_reply_zh,inquiry_reply_en FROM workflow_settings")
  ).rows;
  await db.query("UPDATE workflow_settings SET inquiry_reply_zh=NULL,inquiry_reply_en=NULL");
  try {
    await down(args as unknown as MigrateDownArgs);
    await up(args);
    assert.deepEqual(await databaseFingerprints(db, columns), baseline);
  } finally {
    for (const row of originals)
      await db.query(
        "UPDATE workflow_settings SET inquiry_reply_zh=$1,inquiry_reply_en=$2 WHERE id=$3",
        [row.inquiry_reply_zh, row.inquiry_reply_en, row.id],
      );
  }
  console.log(`PASS migration round-trip preserves ${baseline.length} tables' old columns`);
} finally {
  await db.end();
}
const p = await getPayload({ config });
const admin = (
  await p.find({ collection: "staff", where: { role: { equals: "admin" } }, limit: 1 })
).docs[0];
assert.ok(admin);
const original = await p.findGlobal({ slug: "workflow-settings", depth: 0 });
const created: number[] = [];
try {
  await assert.rejects(() => p.findGlobal({ slug: "workflow-settings", overrideAccess: false }));
  for (const role of ["manager", "operations", "editor", "reviewer"] as const) {
    const user = await p.create({
      collection: "staff",
      user: admin,
      overrideAccess: false,
      data: {
        name: "DEMO receipt permission",
        email: `${randomUUID()}@example.invalid`,
        password: randomBytes(24).toString("hex"),
        active: true,
        role,
      },
    });
    created.push(user.id);
    await assert.rejects(() =>
      p.findGlobal({ slug: "workflow-settings", user, overrideAccess: false }),
    );
    await assert.rejects(() =>
      p.updateGlobal({
        slug: "workflow-settings",
        user,
        overrideAccess: false,
        data: { inquiryReplyZh: "Denied" },
      }),
    );
  }
  await assert.rejects(() =>
    p.updateGlobal({
      slug: "workflow-settings",
      user: { ...admin, active: false },
      overrideAccess: false,
      data: { inquiryReplyEn: "Denied" },
    }),
  );
  const saved = await p.updateGlobal({
    slug: "workflow-settings",
    user: admin,
    overrideAccess: false,
    data: { inquiryReplyZh: "虚构自定义回复", inquiryReplyEn: "Fictional custom reply" },
  });
  assert.deepEqual(publicInquiryReplies(saved), {
    zh: "虚构自定义回复",
    en: "Fictional custom reply",
  });
  assert.equal(saved.emailEnabled, original.emailEnabled);
  assert.equal(saved.escalationEnabled, original.escalationEnabled);
  await assert.rejects(() =>
    p.updateGlobal({
      slug: "workflow-settings",
      user: admin,
      overrideAccess: false,
      data: { inquiryReplyEn: "x".repeat(501) },
    }),
  );
  const rollbackDb = new pg.Pool({ connectionString: url.toString() });
  try {
    await assert.rejects(
      () =>
        down({
          db: { execute: (sql: string) => rollbackDb.query(sql) },
        } as unknown as MigrateDownArgs),
      /Preserve inquiry reply/,
    );
  } finally {
    await rollbackDb.end();
  }
  const cleared = await p.updateGlobal({
    slug: "workflow-settings",
    user: admin,
    overrideAccess: false,
    data: { inquiryReplyZh: " ", inquiryReplyEn: "" },
  });
  assert.deepEqual(publicInquiryReplies(cleared), defaultInquiryReplies);
  console.log(
    "PASS admin-only configuration, inactive/other roles denied, max length, rollback guard, empty defaults; mail switches unchanged",
  );
} finally {
  await p.updateGlobal({
    slug: "workflow-settings",
    data: { inquiryReplyZh: original.inquiryReplyZh, inquiryReplyEn: original.inquiryReplyEn },
  });
  for (const id of created) await p.delete({ collection: "staff", id });
  await p.destroy();
}
process.exit(0);
