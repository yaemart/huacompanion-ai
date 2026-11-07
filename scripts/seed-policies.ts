import "dotenv/config";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import type { Payload } from "payload";
import { parsePolicySeeds } from "../src/lib/immigration-policy-seed";
import { policySeedEnvironment } from "../src/lib/immigration-policy-seed-env";
import { seedPolicyDrafts } from "../src/server/immigration/seed";

let p: Payload | undefined;
try {
  const { values } = parseArgs({
    options: { file: { type: "string" }, apply: { type: "boolean", default: false } },
  });
  const local = policySeedEnvironment({
    APP_ENV: process.env.APP_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
  });
  if (!local || !values.file) throw Error("Invalid local seed setup");
  const file = await readFile(values.file);
  if (file.length > 1024 * 1024) throw Error("Seed file exceeds 1 MiB");
  const input: unknown = JSON.parse(file.toString("utf8"));
  parsePolicySeeds(input);
  const { getPayload } = await import("payload");
  const { default: config } = await import("../src/payload.config");
  p = await getPayload({ config });
  const admin = (
    await p.find({
      collection: "staff",
      where: { and: [{ role: { equals: "admin" } }, { active: { not_equals: false } }] },
      sort: "createdAt",
      limit: 1,
    })
  ).docs[0];
  const result = await seedPolicyDrafts(p, admin, input, { apply: values.apply });
  console.log(JSON.stringify({ ...result, applied: values.apply, published: false }));
} catch {
  console.error("Seed not completed. Use --file FILE [--apply] on the dedicated local database.");
  process.exitCode = 1;
} finally {
  try {
    await p?.destroy();
  } catch {
    console.error("Seed cleanup failed; check the local database. Existing drafts are preserved.");
    process.exitCode = 1;
  }
}
process.exit(process.exitCode || 0);
