import { randomBytes } from "node:crypto";
import { assertCrmTarget } from "../../scripts/lib/crm-test-target.mjs";

if (process.env.HUA_CRM_ISOLATED !== "true") throw Error("Isolated module bootstrap only");
assertCrmTarget(process.env.DATABASE_URL ?? "");
const { getPayload } = await import("payload");
const config = (await import("../../src/payload.config")).default;
const p = await getPayload({ config });
try {
  if ((await p.count({ collection: "staff" })).totalDocs !== 0)
    throw Error("Module bootstrap requires a fresh empty test database");
  await p.create({
    collection: "staff",
    context: { allowLocalStaffSetup: true },
    data: {
      name: "Fictional module regression admin",
      email: "module-admin@example.invalid",
      password: randomBytes(32).toString("hex"),
      role: "admin",
      active: true,
    },
  });
} finally {
  await p.destroy();
}
// Payload may retain background handles after destroy; this is a one-shot test child.
process.exit(0);
