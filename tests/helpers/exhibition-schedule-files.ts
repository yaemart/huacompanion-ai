import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { dirname, join } from "node:path";

const [path, phase, fault] = process.argv.slice(2);
assert.ok(path.startsWith(join(fs.realpathSync(process.cwd()), ".local", "schedule-directory-")));
const scope = { key: "fair-a", locale: "zh" as const };
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
let armed = phase === "create",
  injected = false;
const fail = () => {
  injected = true;
  throw Error("Injected storage boundary failure");
};
const write = fs.writeFileSync,
  sync = fs.fsyncSync,
  close = fs.closeSync,
  link = fs.linkSync,
  unlink = fs.unlinkSync,
  open = fs.openSync,
  mkdir = fs.mkdirSync;
fs.writeFileSync = ((...args: Parameters<typeof write>) => {
  if (armed && !injected && fault === "write") fail();
  return write(...args);
}) as typeof write;
const writes = new Set<number>();
fs.openSync = ((...args: Parameters<typeof open>) => {
  if (armed && !injected && fault === "open" && String(args[0]).includes(".pending-")) fail();
  const fd = open(...args);
  if (
    String(args[0]).startsWith(path + "/") &&
    typeof args[1] === "number" &&
    args[1] & fs.constants.O_CREAT
  )
    writes.add(fd);
  return fd;
}) as typeof open;
fs.fsyncSync = (fd: number) => {
  const s = fs.fstatSync(fd);
  sync(fd);
  if (
    armed &&
    !injected &&
    ((fault === "file-sync" && s.isFile()) ||
      (fault === "directory-sync" && s.isDirectory()) ||
      (fault === "root-sync" && s.isDirectory() && s.ino === fs.lstatSync(path).ino) ||
      (fault === "operations-sync" &&
        s.isDirectory() &&
        fs.existsSync(join(path, "operations")) &&
        s.ino === fs.lstatSync(join(path, "operations")).ino) ||
      (fault === "parent-sync" && s.ino === fs.lstatSync(dirname(path)).ino))
  )
    fail();
};
fs.closeSync = (fd: number) => {
  const ownWrite = writes.delete(fd),
    directory = fs.fstatSync(fd).isDirectory();
  close(fd);
  if (
    armed &&
    !injected &&
    ((fault === "file-close" && ownWrite) || (fault === "directory-close" && directory))
  )
    fail();
};
fs.linkSync = ((...args: Parameters<typeof link>) => {
  if (armed && !injected && fault === "publish") fail();
  return link(...args);
}) as typeof link;
fs.unlinkSync = ((...args: Parameters<typeof unlink>) => {
  unlink(...args);
  if (armed && !injected && fault === "unlink") fail();
}) as typeof unlink;
fs.mkdirSync = ((...args: Parameters<typeof mkdir>) => {
  if (armed && !injected && fault === "mkdir") fail();
  return mkdir(...args);
}) as typeof mkdir;
syncBuiltinESMExports();
const { createScheduleDirectory } =
  await import("../../scripts/lib/exhibition-schedule-directory.ts");
const manifest = { version: 1 as const, targets: [scope] };
if (phase === "create") {
  assert.throws(() => createScheduleDirectory(path, manifest, "c".repeat(64)));
  assert.equal(injected, true);
} else {
  const d = createScheduleDirectory(path, manifest, "c".repeat(64));
  let op: ReturnType<typeof d.plan> | undefined;
  try {
    if (phase !== "started") d.started(start);
    if (["planned", "prepared", "applying", "finished"].includes(phase)) {
      if (phase !== "planned") op = d.plan(scope, seal);
      if (phase === "applying" || phase === "finished") op!.prepared(10);
      if (phase === "finished") op!.applying();
    }
    armed = true;
    const action = () => {
      if (phase === "started") d.started(start);
      else if (phase === "planned") d.plan(scope, seal);
      else if (phase === "prepared") op!.prepared(10);
      else if (phase === "applying") op!.applying();
      else if (phase === "finished") op!.finished(11, "2026-11-27T00:01:00.000Z");
      else if (phase === "stopped") d.stopped();
      else if (phase === "close") d.close();
      else assert.fail("Unknown fixture phase");
    };
    assert.throws(action);
    assert.equal(injected, true);
    assert.throws(() => d.plan(scope, seal));
    if (phase === "prepared")
      assert.equal(fs.existsSync(join(path, "operations", "000001", "applying.json")), false);
    if (phase === "applying")
      assert.equal(fs.existsSync(join(path, "operations", "000001", "finished.json")), false);
  } finally {
    armed = false;
    d.close();
  }
}
console.log("Storage failure propagated without later stage");
