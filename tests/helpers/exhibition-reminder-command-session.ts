import assert from "node:assert/strict";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { syncBuiltinESMExports } from "node:module";
import http from "node:http";
import https from "node:https";
assert.equal(process.env.APP_ENV, "local");
const url = new URL(process.env.DATABASE_URL!);
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.protocol, "postgresql:");
assert.match(url.pathname, /^\/hua_subscriptions_[a-f0-9]{32}$/);
assert.ok(!url.search && !url.hash);
assert.ok(
  (url.port === "55442" && url.username === "hua_demo") ||
    (process.env.GITHUB_ACTIONS === "true" && url.port === "55438" && url.username === "hua"),
);
const marker = process.env.HUA_REMINDER_COMMAND_NETWORK_PROBE;
if (marker) {
  const forbidden = () => {
    appendFileSync(marker, new Error("forbidden HTTP attempt").stack + "\n");
    throw Error("No HTTP is allowed in reminder CLI acceptance");
  };
  globalThis.fetch = forbidden;
  http.request = forbidden;
  http.get = forbidden;
  https.request = forbidden;
  https.get = forbidden;
  syncBuiltinESMExports();
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const fixture = JSON.parse(readFileSync(process.argv[2], "utf8")) as {
    email: string;
    password: string;
    authFile: string;
  };
  process.env.HUA_DEMO_SCHEMA_PUSH = "false";
  process.env.DISABLE_PAYLOAD_HMR = "true";
  const { getPayload } = await import("payload");
  const { default: config } = await import("../../src/payload.config");
  const resolved = await config;
  const db = {
    ...resolved.db,
    init: (args: Parameters<typeof resolved.db.init>[0]) =>
      Object.assign(resolved.db.init(args), { disableCreateDatabase: true, push: false }),
  };
  const safeConfig = Object.assign({}, resolved, {
    telemetry: false,
    typescript: { ...resolved.typescript, autoGenerate: false },
    db,
  });
  const p = await getPayload({ config: safeConfig });
  try {
    const { token } = await p.login({
      collection: "staff",
      data: { email: fixture.email, password: fixture.password },
    });
    assert.ok(token);
    writeFileSync(fixture.authFile, token + "\n", { mode: 0o600, flag: "wx" });
    console.log("Fictional test session prepared privately");
  } finally {
    await p.destroy();
  }
  process.exit(0);
}
