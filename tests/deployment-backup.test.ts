import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  symlinkSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

function runFake(interrupt = false) {
  const root = mkdtempSync(path.join(os.tmpdir(), "hua-backup-test-"));
  const log = path.join(root, "calls.jsonl");
  mkdirSync(path.join(root, "scripts"));
  copyFileSync("scripts/compose-backup.mjs", path.join(root, "scripts/compose-backup.mjs"));
  symlinkSync(path.resolve("node_modules"), path.join(root, "node_modules"), "dir");
  writeFileSync(path.join(root, ".env.compose"), "POSTGRES_USER=hua\nPOSTGRES_DB=hua_companion\n");
  const fake = path.join(root, "docker-fake.mjs");
  writeFileSync(
    fake,
    `#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs";
const a=process.argv.slice(2);
appendFileSync(process.env.FAKE_LOG,JSON.stringify(a)+"\\n");
if(a[0]==="context")process.stdout.write("unix:///local-only");
else if(a.includes("ps")){
 const calls=readFileSync(process.env.FAKE_LOG,"utf8").split("\\n").filter(Boolean).map(JSON.parse);
 const stopped=calls.some(c=>c.includes("stop"));
 const entries=[{Service:"web",State:stopped?"exited":"running"},{Service:"support-worker",State:stopped?"exited":"restarting"},{Service:"workflow-worker",State:"exited"}];
 process.stdout.write(a.includes("--services") ? "web\\n" : JSON.stringify(entries));
}else if(a.includes("scripts/backup-inventory.mjs")){
 if(process.env.FAKE_INTERRUPT==="true")process.kill(process.ppid,"SIGTERM");
 process.stdout.write('{"tables":{},"media":{}}');
}else if(a.includes("pg_dump"))process.stdout.write("fictional dump");
else if(a.includes("tar"))process.stdout.write("fictional archive");
else if(a.includes("images"))process.stdout.write("local-image-id");
`,
    { mode: 0o700 },
  );
  try {
    let status = 0;
    try {
      execFileSync(process.execPath, [path.join(root, "scripts/compose-backup.mjs"), "backup"], {
        env: {
          ...process.env,
          DOCKER_HOST: "",
          DOCKER_BIN: fake,
          FAKE_LOG: log,
          FAKE_INTERRUPT: String(interrupt),
        },
        stdio: "pipe",
        timeout: 10000,
      });
    } catch (error) {
      status = Number((error as { status?: number }).status ?? -1);
    }
    const calls: string[][] = readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const stop = calls.find((args) => args.includes("stop"));
    const start = calls.find((args) => args.includes("start"));
    assert.deepEqual(stop?.slice(stop.indexOf("stop") + 1), [
      "web",
      "support-worker",
      "workflow-worker",
    ]);
    assert.deepEqual(start?.slice(start.indexOf("start") + 1), ["web", "support-worker"]);
    assert.equal(status, interrupt ? 143 : 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
test("paired backup freezes restarting writers too and restores original active services", () =>
  runFake());
test("SIGTERM during capture restores writers before returning interrupted status", () =>
  runFake(true));
