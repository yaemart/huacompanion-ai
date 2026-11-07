import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const template = readFileSync(new URL("../docker/compose.env.example", import.meta.url), "utf8");
const value = template
  .replace("replace-with-random-url-safe-secret", randomBytes(30).toString("base64url"))
  .replace("replace-with-at-least-32-random-characters", randomBytes(40).toString("base64url"));
try {
  writeFileSync(new URL("../.env.compose", import.meta.url), value, { mode: 0o600, flag: "wx" });
  console.log(
    "Created ignored .env.compose with random local secrets; no external services enabled.",
  );
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.log(".env.compose already exists; kept existing secrets and settings.");
}
