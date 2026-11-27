import assert from "node:assert/strict";
import test, { after } from "node:test";
import {
  chmodSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import {
  parseScheduleManifest,
  readScheduleManifest,
  assertNewScheduleDirectory,
  scheduleManifestDigest,
} from "../scripts/lib/exhibition-schedule-input.ts";
const local = join(realpathSync(process.cwd()), ".local");
mkdirSync(local, { recursive: true, mode: 0o700 });
const root = mkdtempSync(join(local, "schedule-input-"));
after(() => rmSync(root, { recursive: true, force: true }));
const raw = {
  version: 1,
  targets: [
    { key: "fair-b", locale: "zh" },
    { key: "fair-a", locale: "en" },
  ],
};
test("fixed manifest is canonical and immutable", () => {
  const source = structuredClone(raw),
    parsed = parseScheduleManifest(source);
  assert.deepEqual(parsed.targets, [
    { key: "fair-a", locale: "en" },
    { key: "fair-b", locale: "zh" },
  ]);
  assert.ok(
    Object.isFrozen(parsed) &&
      Object.isFrozen(parsed.targets) &&
      Object.isFrozen(parsed.targets[0]),
  );
  const digest = scheduleManifestDigest(parsed);
  assert.match(digest, /^[a-f0-9]{64}$/);
  source.targets[0].key = "changed";
  assert.equal(scheduleManifestDigest(parsed), digest);
  assert.equal(
    scheduleManifestDigest(
      parseScheduleManifest({ version: 1, targets: [...raw.targets].reverse() }),
    ),
    digest,
  );
});
for (const [name, value] of Object.entries({
  empty: { version: 1, targets: [] },
  oversized: {
    version: 1,
    targets: Array.from({ length: 21 }, (_, i) => ({ key: "fair-" + i, locale: "zh" })),
  },
  duplicate: { version: 1, targets: [raw.targets[0], raw.targets[0]] },
  version: { ...raw, version: 2 },
  field: { ...raw, token: "private-token-marker" },
  scope: { version: 1, targets: [{ key: "fair", locale: "zh", staffId: 1 }] },
  key: { version: 1, targets: [{ key: "../../private", locale: "zh" }] },
  language: { version: 1, targets: [{ key: "fair", locale: "ja" }] },
  primitive: null,
}))
  test("rejects invalid manifest " + name, () => assert.throws(() => parseScheduleManifest(value)));
test("twenty distinct scopes and two languages for one edition remain allowed", () => {
  assert.equal(
    parseScheduleManifest({
      version: 1,
      targets: Array.from({ length: 20 }, (_, i) => ({ key: "fair-" + i, locale: "zh" })),
    }).targets.length,
    20,
  );
  assert.equal(
    parseScheduleManifest({
      version: 1,
      targets: [
        { key: "fair", locale: "zh" },
        { key: "fair", locale: "en" },
      ],
    }).targets.length,
    2,
  );
});
test("real private manifest snapshot is independent of later file changes", () => {
  const file = join(root, "manifest.json");
  writeFileSync(file, JSON.stringify(raw), { mode: 0o600 });
  const m = readScheduleManifest(file),
    before = scheduleManifestDigest(m);
  writeFileSync(file, '{"version":2,"private-token-marker":true}');
  assert.equal(scheduleManifestDigest(m), before);
  assert.throws(
    () => readScheduleManifest(file),
    (e) => e instanceof Error && !e.message.includes("private-token-marker"),
  );
});
test("file rules reject permission, link, size and malformed UTF8 independently", () => {
  const file = join(root, "input.json");
  writeFileSync(file, JSON.stringify(raw), { mode: 0o600 });
  assert.equal(readScheduleManifest(file).targets.length, 2);
  chmodSync(file, 0o640);
  assert.throws(() => readScheduleManifest(file));
  chmodSync(file, 0o600);
  const soft = join(root, "soft"),
    hard = join(root, "hard");
  symlinkSync(file, soft);
  assert.throws(() => readScheduleManifest(soft));
  linkSync(file, hard);
  assert.throws(() => readScheduleManifest(file));
  rmSync(hard);
  writeFileSync(file, Buffer.concat([Buffer.from(JSON.stringify(raw)), Buffer.from([0xff])]));
  assert.throws(() => readScheduleManifest(file));
  writeFileSync(file, " ".repeat(16385));
  assert.throws(() => readScheduleManifest(file));
});
test("FIFO manifest cannot hang the real consumer process", () => {
  const fifo = join(root, "fifo");
  execFileSync("mkfifo", [fifo]);
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--input-type=module",
      "-e",
      `import {readScheduleManifest} from './scripts/lib/exhibition-schedule-input.ts';try{readScheduleManifest(process.argv[1]);process.exit(2)}catch{process.exit(0)}`,
      fifo,
    ],
    { timeout: 3000 },
  );
  assert.equal(result.status, 0);
});
test("new directory precheck rejects existing paths, symlink ancestry and writable parents", () => {
  const valid = join(root, "new");
  assert.equal(assertNewScheduleDirectory(valid), valid);
  mkdirSync(valid);
  assert.throws(() => assertNewScheduleDirectory(valid));
  const symlink = join(root, "parent-link");
  symlinkSync(root, symlink);
  assert.throws(() => assertNewScheduleDirectory(join(symlink, "else")));
  const shared = join(root, "shared");
  mkdirSync(shared, { mode: 0o777 });
  chmodSync(shared, 0o777);
  assert.throws(() => assertNewScheduleDirectory(join(shared, "new")));
  const ordinary = join(root, "file-parent");
  writeFileSync(ordinary, "x");
  assert.throws(() => assertNewScheduleDirectory(join(ordinary, "new")));
});
for (const mode of ["owner", "replacement", "growth"])
  test("read rejects changed " + mode + " metadata", () => {
    const file = join(root, mode + ".json");
    writeFileSync(file, JSON.stringify(raw), { mode: 0o600 });
    const script = `import fs from 'node:fs';import{syncBuiltinESMExports}from'node:module';import assert from'node:assert/strict';
    const path=process.argv[1],mode=process.argv[2],read=fs.readSync,stat=fs.fstatSync;
    if(mode==='owner')fs.fstatSync=(...args)=>{const s=stat(...args);return Object.assign(s,{uid:s.uid+1})};
    else fs.readSync=(...args)=>{const n=read(...args);if(mode==='replacement'){fs.renameSync(path,path+'.old');fs.writeFileSync(path,'{}',{mode:0o600})}else fs.appendFileSync(path,' ');return n};
    syncBuiltinESMExports();const{readScheduleManifest}=await import('./scripts/lib/exhibition-schedule-input.ts');
    assert.throws(()=>readScheduleManifest(path));`;
    const child = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "--input-type=module", "-e", script, file, mode],
      { encoding: "utf8", timeout: 3000 },
    );
    assert.equal(child.status, 0, child.stderr);
  });
