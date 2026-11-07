import "dotenv/config";
import {
  mkdirSync,
  chmodSync,
  writeFileSync,
  readFileSync,
  cpSync,
  existsSync,
  rmSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { createHash } from "node:crypto";
const url = new URL(process.env.DATABASE_URL || "");
if (
  process.env.APP_ENV !== "local" ||
  url.hostname !== "127.0.0.1" ||
  url.port !== "55438" ||
  url.pathname !== "/hua_companion"
)
  throw Error("Dedicated local database required.");
const bin = process.env.PG_BIN || "/opt/homebrew/opt/postgresql@15/bin";
const name = `hua_restore_${Date.now()}`;
const backup = `backups/local-${Date.now()}.dump`;
mkdirSync("backups", { recursive: true, mode: 0o700 });
const env = {
  ...process.env,
  PGHOST: url.hostname,
  PGPORT: url.port,
  PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password),
};
const run = (command, args) => {
  try {
    return execFileSync(`${bin}/${command}`, args, { env, stdio: "pipe" });
  } catch {
    throw Error(`${command} failed. No credentials logged.`);
  }
};
const source = new pg.Pool({ connectionString: url.toString() });
let restored;
let created = false;
try {
  run("pg_dump", ["-Fc", "--no-owner", "-f", backup, "hua_companion"]);
  chmodSync(backup, 0o600);
  run("createdb", [name]);
  created = true;
  run("pg_restore", ["--no-owner", "--no-acl", "-d", name, backup]);
  const targetURL = new URL(url);
  targetURL.pathname = "/" + name;
  restored = new pg.Pool({ connectionString: targetURL.toString() });
  const results = [];
  const tableQuery = "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename";
  const tables = (await source.query(tableQuery)).rows.map((row) => row.tablename);
  const restoredTables = (await restored.query(tableQuery)).rows.map((row) => row.tablename);
  if (JSON.stringify(tables) !== JSON.stringify(restoredTables))
    throw Error("Restored table inventory mismatch");
  for (const table of tables) {
    const quoted = '"' + table.replaceAll('"', '""') + '"';
    const query = `SELECT count(*)::int AS count FROM public.${quoted}`;
    const before = (await source.query(query)).rows[0].count;
    const after = (await restored.query(query)).rows[0].count;
    if (before !== after) throw Error(`Restore mismatch for ${table}`);
    const fingerprint = `SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) AS hash FROM public.${quoted} t`;
    if (
      (await source.query(fingerprint)).rows[0].hash !==
      (await restored.query(fingerprint)).rows[0].hash
    )
      throw Error(`Content mismatch for ${table}`);
    results.push({ table, rows: before, restored: after });
  }
  const mediaBackup = backup + ".media";
  const restoreMedia = ".local/" + name + "-media";
  mkdirSync(mediaBackup, { recursive: true, mode: 0o700 });
  const media = (await restored.query("SELECT filename FROM content_media")).rows;
  try {
    for (const { filename } of media) {
      if (!/^[a-f0-9-]+\.webp$/.test(filename)) throw Error("Invalid media filename");
      cpSync(".local/content-media/" + filename, mediaBackup + "/" + filename);
      chmodSync(mediaBackup + "/" + filename, 0o600);
    }
    cpSync(mediaBackup, restoreMedia, { recursive: true });
    for (const { filename } of media) {
      const digest = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
      if (digest(".local/content-media/" + filename) !== digest(restoreMedia + "/" + filename))
        throw Error("Restored media mismatch");
    }
    results.push({
      table: "media_files",
      rows: media.length,
      restored: media.length,
    });
  } finally {
    if (existsSync(restoreMedia)) rmSync(restoreMedia, { recursive: true });
  }
  writeFileSync(
    "backups/last-restore-check.json",
    JSON.stringify({ at: new Date().toISOString(), backup, results }, null, 2),
    { mode: 0o600 },
  );
  console.log(JSON.stringify({ status: "Restore verified", backup, results }));
} finally {
  await source.end();
  if (restored) await restored.end();
  if (created) run("dropdb", [name]);
}
