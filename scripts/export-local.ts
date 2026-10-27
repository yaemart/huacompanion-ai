import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { getPayload } from "payload";
import config from "../src/payload.config";
if (
  process.env.APP_ENV !== "local" ||
  !process.env.DATABASE_URL?.includes("@127.0.0.1:55438/hua_companion")
)
  throw Error("Dedicated local database required");
const payload = await getPayload({ config });
const directory = `.local/exports/${Date.now()}`;
mkdirSync(directory, { recursive: true, mode: 0o700 });
const csv = (value: unknown) => {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[\s]*[=+@\-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
};
try {
  for (const collection of ["inquiries", "providers"] as const) {
    const fields =
      collection === "inquiries"
        ? [
            "reference",
            "name",
            "email",
            "city",
            "status",
            "nextFollowUp",
            "createdAt",
          ]
        : [
            "reference",
            "organisation",
            "name",
            "email",
            "phone",
            "city",
            "languages",
            "status",
            "createdAt",
          ];
    let page = 1;
    const rows: string[] = [fields.map(csv).join(",")];
    while (true) {
      const result = await payload.find({
        collection,
        overrideAccess: true,
        depth: 0,
        limit: 100,
        page,
        sort: "id",
      });
      for (const doc of result.docs)
        rows.push(
          fields
            .map((key) => csv((doc as unknown as Record<string, unknown>)[key]))
            .join(","),
        );
      if (!result.hasNextPage) break;
      page++;
    }
    writeFileSync(
      `${directory}/${collection}.csv`,
      "\uFEFF" + rows.join("\r\n"),
      { mode: 0o600 },
    );
    console.log(
      `${collection}: exported ${rows.length - 1} records to ${directory}/${collection}.csv`,
    );
  }
  for (const collection of [
    "content-drafts",
    "content-published",
    "content-events",
    "content-media",
    "content-agent-tasks",
  ] as const) {
    let page = 1;
    const records: unknown[] = [];
    while (true) {
      const result = await payload.find({
        collection,
        limit: 100,
        page,
        depth: 0,
      });
      records.push(...result.docs);
      if (!result.hasNextPage) break;
      page++;
    }
    writeFileSync(
      `${directory}/${collection}.json`,
      JSON.stringify(
        {
          formatVersion: 1,
          collection,
          exportedAt: new Date().toISOString(),
          records,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    console.log(`${collection}: exported ${records.length} records`);
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await payload.destroy();
  process.exit(process.exitCode || 0);
}
