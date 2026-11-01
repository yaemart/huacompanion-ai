import "dotenv/config";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

// Run only while all writers are stopped. Output counts/hashes, never customer row values.
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  const tables = {};
  const names = await pool.query(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
  );
  for (const { tablename } of names.rows) {
    const quoted = '"' + tablename.replaceAll('"', '""') + '"';
    const hash = createHash("sha256");
    let count = 0;
    for (;;) {
      const result = await pool.query(
        `SELECT to_jsonb(t) AS row FROM public.${quoted} t ORDER BY to_jsonb(t)::text LIMIT 500 OFFSET $1`,
        [count],
      );
      for (const { row } of result.rows) hash.update(JSON.stringify(row) + "\n");
      count += result.rows.length;
      if (result.rows.length < 500) break;
    }
    tables[tablename] = { count, sha256: hash.digest("hex") };
  }
  const media = {};
  const root = path.resolve(".local/content-media");
  async function scan(relative = "") {
    const entries = await readdir(path.join(root, relative), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const filename = path.join(relative, entry.name);
      if (entry.isDirectory()) await scan(filename);
      else if (entry.isFile()) {
        const data = await readFile(path.join(root, filename));
        media[filename] = {
          bytes: data.length,
          sha256: createHash("sha256").update(data).digest("hex"),
        };
      } else throw Error("Unsupported media entry; backup requires regular files/directories");
    }
  }
  await scan();
  const referenced = await pool.query("SELECT filename FROM content_media");
  for (const { filename } of referenced.rows)
    if (!Object.hasOwn(media, filename)) throw Error("Database references a missing media file");
  process.stdout.write(JSON.stringify({ tables, media }));
} finally {
  await pool.end();
}
