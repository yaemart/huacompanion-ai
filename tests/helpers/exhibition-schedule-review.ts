import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
const [root, mode] = process.argv.slice(2);
assert.ok(root.startsWith(join(fs.realpathSync(process.cwd()), ".local", "schedule-directory-")));
const scope = { key: "fair-a", locale: "zh" as const },
  start = { runId: "12345678-1234-4123-8123-123456789abc", owner: 7, revision: 9 };
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
const open = fs.openSync,
  close = fs.closeSync;
let replaced = false,
  selected: number | undefined,
  reused: number | undefined,
  armed = false;
const path = join(root, "run"),
  manifestFile = join(root, "input.json");
fs.mkdirSync(root, { mode: 0o700 });
fs.writeFileSync(manifestFile, JSON.stringify({ version: 1, targets: [scope] }), { mode: 0o600 });
fs.openSync = ((...args: Parameters<typeof open>) => {
  const name = String(args[0]);
  if (
    mode === "pin-swap" &&
    name === path &&
    typeof args[1] === "number" &&
    args[1] & fs.constants.O_DIRECTORY &&
    !replaced
  ) {
    replaced = true;
    fs.renameSync(path, path + ".original");
    fs.mkdirSync(path, { mode: 0o700 });
  }
  const fd = open(...args);
  if (
    (mode === "input-close" && name === manifestFile) ||
    (mode === "temporary-close" && armed && name.includes(".pending-")) ||
    (mode === "operation-close" && name === join(path, "operations", "000001"))
  )
    selected = fd;
  return fd;
}) as typeof open;
fs.closeSync = (fd) => {
  close(fd);
  if (fd === selected && reused === undefined && mode !== "pin-swap") {
    reused = open(
      join(root, "foreign-resource"),
      fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_EXCL,
      0o600,
    );
    assert.equal(reused, fd, "fixture must actually reuse the released descriptor number");
    throw Error("Close completed but response lost");
  }
};
syncBuiltinESMExports();
const { createScheduleDirectory } =
  await import("../../scripts/lib/exhibition-schedule-directory.ts");
const { readScheduleManifest } = await import("../../scripts/lib/exhibition-schedule-input.ts");
if (mode === "pin-swap") {
  assert.throws(() =>
    createScheduleDirectory(path, { version: 1, targets: [scope] }, "c".repeat(64)),
  );
  assert.equal(replaced, true);
  assert.equal(fs.existsSync(join(path, "run.json")), false);
} else if (mode === "input-close") {
  assert.throws(() => readScheduleManifest(manifestFile));
  assert.notEqual(reused, undefined);
  assert.ok(fs.fstatSync(reused!).isFile());
  close(reused!);
} else {
  const d = createScheduleDirectory(path, { version: 1, targets: [scope] }, "c".repeat(64));
  try {
    if (mode === "temporary-close") {
      armed = true;
      assert.throws(() => d.started(start));
    } else {
      d.started(start);
      const op = d.plan(scope, seal);
      op.prepared(10);
      op.applying();
      assert.throws(() => op.finished(11, "2026-11-27T00:01:00.000Z"));
    }
  } finally {
    d.close();
  }
  assert.notEqual(reused, undefined);
  assert.ok(fs.fstatSync(reused!).isFile());
  close(reused!);
}
console.log("Protected original identity and descriptor ownership");
