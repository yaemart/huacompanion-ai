import "dotenv/config";
import { getPayload } from "payload";
import config from "../src/payload.config";
import { transactionSession } from "../src/server/db-types";
import { bootstrapInput } from "./lib/bootstrap-input";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--apply")) throw Error("Use bootstrap:admin [-- --apply]");
const input = bootstrapInput(process.env);
const p = await getPayload({ config });
try {
  if (!args.includes("--apply")) {
    const count = await p.count({ collection: "staff", overrideAccess: true });
    console.log(
      count.totalDocs === 0
        ? "Dry-run: empty staff table, ready to bootstrap."
        : "Existing staff found; bootstrap will not change accounts.",
    );
  } else {
    const id = await p.db.beginTransaction();
    if (!id) throw Error("Bootstrap requires a database transaction");
    try {
      await transactionSession(p, id).db.execute("SELECT pg_advisory_xact_lock(726272)");
      const req = { transactionID: id };
      const count = await p.count({ collection: "staff", overrideAccess: true, req });
      if (count.totalDocs !== 0)
        console.log("Existing staff found; no accounts or passwords changed.");
      else {
        const actor = await p.create({
          collection: "staff",
          overrideAccess: true,
          context: { allowLocalStaffSetup: true },
          req,
          data: { ...input, role: "admin", active: true },
        });
        await p.create({
          collection: "audit-events",
          overrideAccess: true,
          req,
          data: {
            entity: "staff",
            recordId: String(actor.id),
            action: "trial-first-admin",
            actor: actor.id,
            fields: "role,active",
          },
        });
        console.log("First trial administrator created; credentials were not printed.");
      }
      await p.db.commitTransaction(id);
    } catch (error) {
      await p.db.rollbackTransaction(id);
      throw error;
    }
  }
} finally {
  await p.destroy();
}
process.exit(0);
