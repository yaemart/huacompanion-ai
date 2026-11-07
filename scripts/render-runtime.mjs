import { setInterval, clearInterval } from "node:timers";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { access, constants } from "node:fs/promises";

/** Return names only: never log connection strings or credentials. */
export function validateRenderTrial(env, role) {
  const errors = [];
  if (!["web", "support", "workflow"].includes(role)) errors.push("role");
  for (const [key, value] of Object.entries({
    APP_ENV: "trial",
    SITE_LOCALES: "en,zh",
    SEARCH_ENGINE_INDEXING: "false",
    INTAKE_ENABLED: "false",
    WORKFLOW_MAIL_ENABLED: "false",
    BUSINESS_AI_ENABLED: "false",
    SUPPORT_CALL_AI_ENABLED: "false",
    TRIAL_ACCESS_REQUIRED: "true",
  }))
    if (env[key] !== value) errors.push(key);
  if (!["false", "true"].includes(env.VISA_CHECKER_ENABLED)) errors.push("VISA_CHECKER_ENABLED");
  if (role !== "web" && !["false", "true"].includes(env.TRIAL_WORKERS_ENABLED))
    errors.push("TRIAL_WORKERS_ENABLED");
  for (const key of ["PAYLOAD_SECRET", "TRIAL_ACCESS_PASSWORD"])
    if (!env[key] || env[key].length < 32 || env[key].length > 256) errors.push(key);
  if (!/^[a-zA-Z0-9_-]{3,64}$/.test(env.TRIAL_ACCESS_USER || "")) errors.push("TRIAL_ACCESS_USER");
  try {
    const url = new URL(env.APP_URL);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      errors.push("APP_URL");
  } catch {
    errors.push("APP_URL");
  }
  try {
    const db = new URL(env.DATABASE_URL);
    if (
      !["postgres:", "postgresql:"].includes(db.protocol) ||
      !db.hostname ||
      db.pathname.length < 2
    )
      errors.push("DATABASE_URL");
  } catch {
    errors.push("DATABASE_URL");
  }
  for (const key of [
    "SUPPORT_AI_KEY",
    "SUPPORT_SPEECH_KEY",
    "SUPPORT_CALL_GATEWAY_KEY",
    "BUSINESS_AI_KEY",
    "WORKFLOW_MAIL_API_KEY",
  ])
    if (env[key]) errors.push(key);
  return errors;
}

async function main() {
  const role = process.argv[2];
  const errors = validateRenderTrial(process.env, role);
  if (errors.length) throw Error(`Trial configuration rejected: ${errors.join(", ")}`);
  if (process.argv.includes("--check")) {
    console.log("PASS restricted trial configuration");
    return;
  }
  if (role !== "web" && process.env.TRIAL_WORKERS_ENABLED !== "true") {
    const timer = setInterval(() => {}, 60000);
    for (const signal of ["SIGTERM", "SIGINT"])
      process.on(signal, () => {
        clearInterval(timer);
      });
    console.log(
      "Trial worker on standby; enable only after migration and trial settings verification.",
    );
    return;
  }
  if (role === "web") await access(".local/content-media", constants.W_OK);
  const args =
    role === "web"
      ? [
          "node_modules/next/dist/bin/next",
          "start",
          "--hostname",
          "0.0.0.0",
          "--port",
          process.env.PORT || "3000",
        ]
      : ["--import", "tsx", `scripts/${role === "support" ? "support" : "workflow"}-worker.ts`];
  const child = spawn(process.execPath, args, { stdio: "inherit", env: process.env });
  for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
  child.on("error", () => {
    console.error("Trial process could not start");
    process.exitCode = 1;
  });
  child.on("exit", (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
