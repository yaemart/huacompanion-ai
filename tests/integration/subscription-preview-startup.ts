import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { subscriptionPreview } from "../../scripts/lib/subscription-preview.mjs";

const projectRoot = process.cwd();

async function previewFixture(mode: "success" | "failure" | "abort") {
  const root = mkdtempSync(resolve(tmpdir(), "hua-preview-test-"));
  const events = resolve(root, "events.jsonl");
  const signal = new AbortController();
  const source = `
    import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
    const record = (event) => appendFileSync(process.env.PREVIEW_TEST_EVENTS,
      JSON.stringify({ event, cwd: process.cwd(), mode: process.env.NODE_ENV }) + '\\n');
  `;
  try {
    for (const dir of [".local", "src", "scripts", "public", "tests/integration", "node_modules"])
      mkdirSync(resolve(root, dir), { recursive: true });
    for (const name of ["package-lock.json", "tsconfig.json", "next-env.d.ts", "payload-types.ts"])
      writeFileSync(resolve(root, name), "");
    writeFileSync(resolve(root, "package.json"), '{"type":"module"}');
    writeFileSync(resolve(root, "next.config.mjs"), "export default {};");
    writeFileSync(resolve(root, "scripts/dev-env.mjs"), "");
    symlinkSync(resolve(projectRoot, "node_modules/tsx"), resolve(root, "node_modules/tsx"));
    mkdirSync(resolve(root, "node_modules/next/dist/bin"), { recursive: true });
    writeFileSync(resolve(root, "node_modules/next/package.json"), '{"type":"module"}');
    writeFileSync(
      resolve(root, "node_modules/next/dist/bin/next"),
      source +
        `
        const command = process.argv[2];
        record(command);
        if (command === 'build') {
          if (process.env.PREVIEW_TEST_MODE === 'failure') process.exit(1);
          if (process.env.PREVIEW_TEST_MODE === 'abort') setInterval(() => {}, 1000);
          else {
            mkdirSync('.next');
            writeFileSync('.next/BUILD_ID', 'fixture-build');
            record('built');
          }
        } else if (command === 'start' && existsSync('.next/BUILD_ID')) {
          process.on('SIGTERM', () => { record('web-stopped'); process.exit(0); });
          setInterval(() => {}, 1000);
        } else process.exit(2);
        `,
    );
    writeFileSync(
      resolve(root, "tests/integration/subscription-preview.ts"),
      source +
        `
        record('seeded');
        process.on('SIGTERM', () => { record('mail-stopped'); process.exit(0); });
        setInterval(() => {}, 1000);
        process.send('ready');
        `,
    );
    process.chdir(root);
    const pending = subscriptionPreview(
      { PREVIEW_TEST_EVENTS: events, PREVIEW_TEST_MODE: mode },
      signal.signal,
      true,
    );
    const result = pending.then(
      () => undefined,
      (error: Error) => error,
    );
    const until = Date.now() + 10000;
    let history: { event: string; cwd: string; mode: string }[] = [];
    while (Date.now() < until) {
      history = existsSync(events)
        ? readFileSync(events, "utf8")
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line))
        : [];
      if (history.some((row) => row.event === (mode === "abort" ? "build" : "start"))) break;
      if (await Promise.race([result.then(() => true), delay(20).then(() => false)])) break;
    }
    signal.abort();
    const error = await result;
    const final = readFileSync(events, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line)) as { event: string; cwd: string; mode: string }[];
    assert.deepEqual(readdirSync(resolve(root, ".local")), [], "preview copy is removed");
    assert.ok(
      final.some((row) => row.event === "mail-stopped"),
      "mock mail process stops",
    );
    return { error, history: final };
  } finally {
    signal.abort();
    process.chdir(projectRoot);
    rmSync(root, { recursive: true, force: true });
  }
}

test("isolated preview builds both route groups before starting the production server", async () => {
  const { error, history } = await previewFixture("success");
  assert.equal(error, undefined);
  assert.deepEqual(
    history
      .filter((row) => ["seeded", "build", "built", "start"].includes(row.event))
      .map((row) => row.event),
    ["seeded", "build", "built", "start"],
  );
  const processes = history.filter((row) => ["build", "start"].includes(row.event));
  assert.ok(processes.every((row) => row.mode === "production"));
  assert.equal(processes[0].cwd, processes[1].cwd);
  assert.ok(history.some((row) => row.event === "web-stopped"));
});

test("a failed preview build stops the mock process and never starts a server", async () => {
  const { error, history } = await previewFixture("failure");
  assert.match(error!.message, /构建失败/);
  assert.ok(history.some((row) => row.event === "build"));
  assert.ok(history.every((row) => row.event !== "start"));
});

test("interrupting a preview build cleans up its child processes and copy", async () => {
  const { error, history } = await previewFixture("abort");
  assert.equal(error, undefined);
  assert.ok(history.some((row) => row.event === "build"));
  assert.ok(history.every((row) => row.event !== "start"));
});
