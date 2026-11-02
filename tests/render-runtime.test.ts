import test from "node:test";
import assert from "node:assert/strict";
import { validateRenderTrial } from "../scripts/render-runtime.mjs";
const env = {
  APP_ENV: "trial",
  APP_URL: "https://trial.example.invalid",
  DATABASE_URL: "postgresql://u:p@db/trial",
  PAYLOAD_SECRET: "s".repeat(40),
  SITE_LOCALES: "en,zh",
  SEARCH_ENGINE_INDEXING: "false",
  INTAKE_ENABLED: "false",
  VISA_CHECKER_ENABLED: "false",
  WORKFLOW_MAIL_ENABLED: "false",
  BUSINESS_AI_ENABLED: "false",
  SUPPORT_CALL_AI_ENABLED: "false",
  TRIAL_ACCESS_REQUIRED: "true",
  TRIAL_ACCESS_USER: "trial",
  TRIAL_ACCESS_PASSWORD: "p".repeat(40),
  TRIAL_WORKERS_ENABLED: "false",
};
test("Render preflight rejects unsafe defaults, bad URLs and missing secrets without exposing values", () => {
  assert.deepEqual(validateRenderTrial(env, "web"), []);
  for (const key of ["APP_URL", "DATABASE_URL", "PAYLOAD_SECRET", "TRIAL_ACCESS_PASSWORD"])
    assert.ok(validateRenderTrial({ ...env, [key]: "" }, "web").includes(key));
  for (const key of [
    "INTAKE_ENABLED",
    "SEARCH_ENGINE_INDEXING",
    "WORKFLOW_MAIL_ENABLED",
    "BUSINESS_AI_ENABLED",
  ])
    assert.ok(validateRenderTrial({ ...env, [key]: "true" }, "web").includes(key));
  assert.ok(
    validateRenderTrial({ ...env, APP_URL: "http://public.example.invalid" }, "web").includes(
      "APP_URL",
    ),
  );
  assert.ok(
    validateRenderTrial({ ...env, SUPPORT_AI_KEY: "secret-must-not-appear" }, "support").includes(
      "SUPPORT_AI_KEY",
    ),
  );
  assert.ok(validateRenderTrial(env, "unknown").includes("role"));
});

test("standby worker stays alive without DB access and stops cleanly", async () => {
  const { spawn } = await import("node:child_process");
  const child = spawn(process.execPath, ["scripts/render-runtime.mjs", "support"], {
    env: { ...process.env, ...env, DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) =>
    child.once("exit", (code, signal) => resolve({ code, signal })),
  );
  const timeout = setTimeout(() => child.kill("SIGKILL"), 5000);
  try {
    const chunk = await new Promise<Buffer>((resolve, reject) => {
      child.stdout.once("data", resolve);
      child.once("error", reject);
      child.once("exit", () => reject(Error("worker exited before readiness")));
    });
    assert.match(String(chunk), /on standby/);
    child.kill("SIGTERM");
    const { code, signal } = await exit;
    assert.equal(code, 0);
    assert.equal(signal, null);
  } finally {
    clearTimeout(timeout);
    child.kill("SIGKILL");
  }
});
