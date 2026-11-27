import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createScheduleDirectory } from "../scripts/lib/exhibition-schedule-directory.ts";
import { parseScheduleManifest } from "../scripts/lib/exhibition-schedule-input.ts";
import { readReminderFile } from "../scripts/lib/exhibition-reminder-command.ts";
const local = join(realpathSync(process.cwd()), ".local");
mkdirSync(local, { recursive: true, mode: 0o700 });
const root = mkdtempSync(join(local, "schedule-directory-"));
after(() => rmSync(root, { recursive: true, force: true }));
const scope = { key: "fair-a", locale: "zh" as const };
const manifest = parseScheduleManifest({ version: 1, targets: [scope] });
const start = { runId: "12345678-1234-4123-8123-123456789abc", owner: 7, revision: 9 };
const seal =
  Buffer.from(
    JSON.stringify({
      ...scope,
      actor: 7,
      today: "2026-11-27",
      at: "2026-11-27T00:00:00.000Z",
      fingerprint: "a".repeat(64),
    }),
  ).toString("base64url") +
  "." +
  "b".repeat(64);
const digest = createHash("sha256").update(JSON.stringify(seal)).digest("hex");
const next = () => join(root, "run-" + readdirSync(root).length);
const snapshot = (path: string): Record<string, string> =>
  Object.fromEntries(
    readdirSync(path).flatMap((n) => {
      const p = join(path, n),
        stat = lstatSync(p);
      return stat.isDirectory()
        ? Object.entries(snapshot(p)).map(([k, v]) => [n + "/" + k, v])
        : [[n, readFileSync(p).toString("base64")]];
    }),
  );
test("existing run directory never becomes writable", () => {
  const path = next(),
    d = createScheduleDirectory(path, manifest, "c".repeat(64));
  try {
    const before = snapshot(path);
    assert.throws(() => createScheduleDirectory(path, manifest, "c".repeat(64)));
    assert.deepEqual(snapshot(path), before);
    assert.equal(lstatSync(path).mode & 0o7777, 0o700);
    assert.equal(lstatSync(join(path, "run.json")).mode & 0o7777, 0o600);
  } finally {
    d.close();
  }
});
test("journal keeps original receipt and independently derived digest through all phases", () => {
  const path = next(),
    d = createScheduleDirectory(path, manifest, "c".repeat(64));
  try {
    const run = JSON.parse(readFileSync(join(path, "run.json"), "utf8"));
    assert.deepEqual(Object.keys(run).sort(), [
      "databaseBinding",
      "localRunId",
      "manifest",
      "manifestDigest",
      "version",
    ]);
    d.started(start);
    const op = d.plan(scope, seal),
      folder = join(path, "operations", "000001");
    assert.equal(readReminderFile(join(folder, "receipt"), "receipt"), seal);
    assert.equal(JSON.parse(readFileSync(join(folder, "planned.json"), "utf8")).digest, digest);
    op.prepared(10);
    op.applying();
    op.finished(11, "2026-11-27T00:01:00.000Z");
    const unchanged = snapshot(path);
    const second = d.plan(scope, seal);
    assert.ok(second);
    for (const [file, bytes] of Object.entries(unchanged))
      assert.equal(readFileSync(join(path, file)).toString("base64"), bytes);
    d.stopped();
    assert.ok(existsSync(join(path, "stopped.json")));
    assert.throws(() => d.plan(scope, seal));
  } finally {
    d.close();
    d.close();
  }
});
for (const kind of [
  "future-version",
  "damaged",
  "replaced-file",
  "permissions",
  "symlink",
  "directory-replaced",
])
  test("active journal refuses altered evidence " + kind, () => {
    const path = next(),
      d = createScheduleDirectory(path, manifest, "c".repeat(64));
    try {
      d.started(start);
      const op = d.plan(scope, seal);
      const target = join(path, "operations", "000001", "planned.json");
      if (kind === "future-version") writeFileSync(target, '{"version":2}');
      if (kind === "damaged") writeFileSync(target, "private-corrupt-marker");
      if (kind === "replaced-file") {
        renameSync(target, target + ".old");
        writeFileSync(target, readFileSync(target + ".old"), { mode: 0o600 });
      }
      if (kind === "permissions") chmodSync(target, 0o644);
      if (kind === "symlink") {
        renameSync(target, target + ".old");
        symlinkSync(target + ".old", target);
      }
      if (kind === "directory-replaced") {
        renameSync(path, path + ".old");
        mkdirSync(path, { mode: 0o700 });
      }
      const before = snapshot(path);
      assert.throws(() => op.prepared(10));
      assert.deepEqual(snapshot(path), before);
    } finally {
      d.close();
    }
  });
test("closed journal cannot write and invalid native identities or scope are rejected", () => {
  const path = next(),
    d = createScheduleDirectory(path, manifest, "c".repeat(64));
  assert.throws(() => d.started({ ...start, owner: 0 }));
  d.close();
  assert.throws(() => d.started(start));
  const other = createScheduleDirectory(next(), manifest, "c".repeat(64));
  try {
    other.started(start);
    assert.throws(() => other.plan({ key: "other", locale: "zh" }, seal));
  } finally {
    other.close();
  }
});
for (const [phase, faults] of Object.entries({
  create: [
    "root-sync",
    "operations-sync",
    "mkdir",
    "open",
    "parent-sync",
    "directory-sync",
    "file-sync",
    "file-close",
    "publish",
  ],
  started: ["write", "file-sync", "file-close", "publish", "unlink", "directory-sync"],
  planned: ["write", "file-sync", "directory-sync"],
  prepared: ["write", "file-sync", "file-close", "publish", "unlink", "directory-sync"],
  applying: ["file-sync", "directory-sync"],
  finished: ["file-close", "directory-sync"],
  stopped: ["directory-sync"],
  close: ["directory-close"],
}))
  for (const fault of faults)
    test(phase + " " + fault + " failure never returns a durable success", () => {
      const path = next();
      const child = spawnSync(
        process.execPath,
        [
          "--experimental-strip-types",
          "tests/helpers/exhibition-schedule-files.ts",
          path,
          phase,
          fault,
        ],
        { encoding: "utf8", timeout: 5000 },
      );
      assert.equal(child.status, 0, child.stderr);
      assert.match(child.stdout, /failure propagated/);
    });
test("replaced parent cannot receive a later journal stage", () => {
  const parent = join(root, "parent-test");
  mkdirSync(parent, { mode: 0o700 });
  const d = createScheduleDirectory(join(parent, "run"), manifest, "c".repeat(64));
  try {
    d.started(start);
    const op = d.plan(scope, seal);
    renameSync(parent, parent + ".old");
    mkdirSync(parent, { mode: 0o700 });
    assert.throws(() => op.prepared(10));
    assert.deepEqual(readdirSync(parent), []);
  } finally {
    d.close();
  }
});
test("out of order and duplicate stages cannot overwrite old evidence", () => {
  const path = next(),
    d = createScheduleDirectory(path, manifest, "c".repeat(64));
  try {
    d.started(start);
    const op = d.plan(scope, seal),
      before = snapshot(path);
    assert.throws(() => op.applying());
    assert.deepEqual(snapshot(path), before);
    assert.throws(() => op.prepared(10));
  } finally {
    d.close();
  }
  const otherPath = next(),
    other = createScheduleDirectory(otherPath, manifest, "c".repeat(64));
  try {
    other.started(start);
    const op = other.plan(scope, seal);
    op.prepared(10);
    const before = snapshot(otherPath);
    assert.throws(() => op.prepared(11));
    assert.deepEqual(snapshot(otherPath), before);
  } finally {
    other.close();
  }
});
test("an unexpected existing stage file cannot be overwritten", () => {
  const path = next(),
    d = createScheduleDirectory(path, manifest, "c".repeat(64));
  try {
    d.started(start);
    const op = d.plan(scope, seal),
      file = join(path, "operations", "000001", "prepared.json");
    writeFileSync(file, '{"version":2,"private":"existing-marker"}', { mode: 0o600 });
    const before = readFileSync(file);
    assert.throws(() => op.prepared(10));
    assert.deepEqual(readFileSync(file), before);
    assert.equal(existsSync(join(path, "operations", "000001", "applying.json")), false);
  } finally {
    d.close();
  }
});
test("caller mutations cannot expand the stored manifest or alter the native start owner", () => {
  const mutable = { version: 1 as const, targets: [{ key: "fair-a", locale: "zh" as const }] };
  const nativeStart = { ...start },
    path = next(),
    d = createScheduleDirectory(path, mutable, "c".repeat(64));
  try {
    d.started(nativeStart);
    nativeStart.owner = 8;
    mutable.targets[0].key = "other";
    const op = d.plan(scope, seal);
    assert.ok(op);
    assert.equal(JSON.parse(readFileSync(join(path, "started.json"), "utf8")).owner, 7);
    assert.equal(
      JSON.parse(readFileSync(join(path, "run.json"), "utf8")).manifest.targets[0].key,
      "fair-a",
    );
  } finally {
    d.close();
  }
});
for (const mode of ["pin-swap", "input-close", "temporary-close", "operation-close"])
  test("review protects " + mode + " before later cleanup", () => {
    const child = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "tests/helpers/exhibition-schedule-review.ts", next(), mode],
      { encoding: "utf8", timeout: 5000 },
    );
    assert.equal(child.status, 0, child.stderr);
  });
for (const stage of ["applying", "finished"])
  test("premature " + stage + " evidence blocks preparation", () => {
    const path = next(),
      d = createScheduleDirectory(path, manifest, "c".repeat(64));
    try {
      d.started(start);
      const op = d.plan(scope, seal),
        file = join(path, "operations", "000001", stage + ".json");
      writeFileSync(file, '{"version":2}', { mode: 0o600 });
      const before = snapshot(path);
      assert.throws(() => op.prepared(10));
      assert.deepEqual(snapshot(path), before);
    } finally {
      d.close();
    }
  });
test("premature stopped marker blocks planning before any new operation", () => {
  const path = next(),
    d = createScheduleDirectory(path, manifest, "c".repeat(64));
  try {
    d.started(start);
    writeFileSync(join(path, "stopped.json"), '{"version":2}', { mode: 0o600 });
    const before = snapshot(path);
    assert.throws(() => d.plan(scope, seal));
    assert.deepEqual(snapshot(path), before);
  } finally {
    d.close();
  }
});
