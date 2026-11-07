import "dotenv/config";
import { getPayload } from "payload";
import config from "../src/payload.config";
import { mutateContent } from "../src/server/content/service";
import { buildStarterProjects } from "./content/starter-projects";
import { validateContent } from "../src/lib/content-model";
if (
  process.env.APP_ENV !== "local" ||
  !process.env.DATABASE_URL?.includes("@127.0.0.1:55438/hua_companion")
)
  throw Error("Dedicated local database required");
const bodies = buildStarterProjects();
if (bodies.length !== 12 || new Set(bodies.map((b) => b.contentKey + ":" + b.locale)).size !== 12)
  throw Error("Expected six bilingual projects");
bodies.forEach(validateContent);
const p = await getPayload({ config });
try {
  const admin = (
    await p.find({
      collection: "staff",
      where: { and: [{ role: { equals: "admin" } }, { active: { not_equals: false } }] },
      sort: "createdAt",
      limit: 1,
    })
  ).docs[0];
  if (!admin) throw Error("Administrator required");
  // Preflight all guide references before creating any records.
  for (const body of bodies)
    for (const key of body.catalog!.guideKeys) {
      const guide = await p.find({
        collection: "content-drafts",
        where: {
          and: [{ identity: { equals: key + ":" + body.locale } }, { kind: { equals: "guide" } }],
        },
        limit: 1,
      });
      if (!guide.totalDocs) throw Error("Missing knowledge draft: " + key + ":" + body.locale);
    }
  let created = 0,
    skipped = 0;
  for (const body of bodies) {
    const existing = await p.find({
      collection: "content-drafts",
      where: { identity: { equals: body.contentKey + ":" + body.locale } },
      limit: 1,
    });
    if (existing.totalDocs) {
      skipped++;
      continue;
    }
    await mutateContent(p, admin, { action: "save", body });
    created++;
  }
  const keys = bodies.map((b) => b.contentKey);
  const result = await p.find({
    collection: "content-drafts",
    where: { and: [{ kind: { equals: "service-project" } }, { contentKey: { in: keys } }] },
    limit: 100,
  });
  if (result.totalDocs !== 12) throw Error("Seed verification: expected twelve drafts");
  console.log(
    JSON.stringify({
      created,
      skipped,
      topics: 6,
      languageDrafts: result.totalDocs,
      publication: "Not requested; existing records never overwritten",
      cities: "No delivery resources asserted; select confirmed cities before publishing",
    }),
  );
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await p.destroy();
  process.exit(process.exitCode || 0);
}
