import "dotenv/config";
import { getPayload } from "payload";
import config from "../src/payload.config";
import { configureTrial } from "../src/server/trial-config";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--apply"))
  throw Error("Usage: npm run trial:configure [-- --apply]. Default is a dry-run.");
if (process.env.APP_ENV !== "local" && process.env.APP_ENV !== "trial")
  throw Error("Trial configuration is restricted to local or trial environments");
const p = await getPayload({ config });
try {
  const result = await configureTrial(p, process.env, args.includes("--apply"));
  console.log(JSON.stringify(result, null, 2));
  console.log(
    "Preserves business records, accounts and content. BUSINESS_AI_ENABLED must remain false. Public intake remains governed by INTAKE_ENABLED.",
  );
} finally {
  await p.destroy();
}
process.exit(0);
