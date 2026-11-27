import { randomUUID } from "node:crypto";
import {
  constants,
  closeSync,
  fchmodSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  unlinkSync,
  writeFileSync,
  type Stats,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  parseReminderEnvelope,
  reminderHash,
  type ReminderScope,
} from "../../src/lib/exhibition-reminders.ts";
import {
  assertNewScheduleDirectory,
  parseScheduleManifest,
  scheduleFileError,
  scheduleManifestDigest,
  readScheduleBytes,
  type ScheduleManifest,
} from "./exhibition-schedule-input.ts";

export type RunStart = { runId: string; owner: number; revision: number };
export type OperationJournal = {
  prepared(revision: number): void;
  applying(): void;
  finished(revision: number, asOf: string): void;
};
export type RunDirectory = {
  started(start: RunStart): void;
  plan(scope: ReminderScope, receipt: string): OperationJournal;
  stopped(): void;
  close(): void;
};
const positive = (n: number) => Number.isSafeInteger(n) && n > 0;
const same = (a: Stats, b: Stats, fields: (keyof Stats)[]) => fields.every((k) => a[k] === b[k]);
export function createScheduleDirectory(
  path: string,
  manifest: ScheduleManifest,
  binding: string,
): RunDirectory {
  const full = assertNewScheduleDirectory(path),
    fixed = parseScheduleManifest(manifest),
    localRunId = randomUUID();
  if (!/^[a-f0-9]{64}$/.test(binding)) throw scheduleFileError();
  const anchors = new Map<string, { fd: number; stat: Stats; private: boolean }>();
  const files = new Map<string, { bytes: Buffer; stat: Stats }>();
  let closed = false,
    broken = false,
    ended = false,
    created = false,
    run: RunStart | undefined,
    sequence = 0,
    active = false;
  const pin = (name: string, privateDirectory: boolean) => {
    if (!constants.O_DIRECTORY || !constants.O_NOFOLLOW) throw Error();
    const fd = openSync(name, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    anchors.set(name, { fd, stat, private: privateDirectory });
    return fd;
  };
  const check = () => {
    if (closed || broken || ended) throw Error();
    assertNewScheduleDirectory(created ? join(full, ".guard-" + localRunId) : full);
    for (const [name, a] of anchors) {
      const s = lstatSync(name),
        opened = fstatSync(a.fd);
      if (
        !s.isDirectory() ||
        s.uid !== process.getuid!() ||
        (a.private && (s.mode & 0o7777) !== 0o700) ||
        !same(s, a.stat, ["dev", "ino", "uid", "mode"]) ||
        !same(opened, s, ["dev", "ino", "uid", "mode"])
      )
        throw Error();
    }
    for (const [name, record] of files) {
      const { bytes, stat } = readScheduleBytes(name);
      if (
        !same(stat, record.stat, [
          "dev",
          "ino",
          "uid",
          "mode",
          "nlink",
          "size",
          "mtimeMs",
          "ctimeMs",
        ]) ||
        !bytes.equals(record.bytes)
      )
        throw Error();
    }
  };
  const perform = <T>(work: () => T): T => {
    try {
      check();
      return work();
    } catch {
      broken = true;
      throw scheduleFileError();
    }
  };
  const save = (folder: string, name: string, value: object | string) => {
    check();
    const bytes = Buffer.from(
      typeof value === "string" ? value + "\n" : JSON.stringify(value) + "\n",
      "utf8",
    );
    if (bytes.length > 16384) throw Error();
    const temporary = join(folder, ".pending-" + randomUUID()),
      target = join(folder, name);
    let fd: number | undefined;
    try {
      fd = openSync(
        temporary,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600,
      );
      fchmodSync(fd, 0o600);
      writeFileSync(fd, bytes);
      fsyncSync(fd);
      closeSync(fd);
      fd = undefined;
      check();
      linkSync(temporary, target);
      unlinkSync(temporary);
      fsyncSync(anchors.get(folder)!.fd);
      files.set(target, { bytes, stat: lstatSync(target) });
      check();
    } finally {
      if (fd !== undefined) {
        try {
          closeSync(fd);
        } catch {
          /* Preserve the save failure. */
        }
      }
    }
  };
  const directory = (name: string, parent: string) => {
    check();
    mkdirSync(name, { mode: 0o700 });
    if (name === full) created = true;
    const fd = pin(name, true);
    fsyncSync(fd);
    fsyncSync(anchors.get(parent)!.fd);
    check();
    return fd;
  };
  const close = () => {
    if (closed) return;
    closed = true;
    let failed = false;
    for (const a of anchors.values()) {
      try {
        closeSync(a.fd);
      } catch {
        failed = true;
      }
    }
    anchors.clear();
    if (failed) throw scheduleFileError();
  };
  try {
    pin(dirname(full), false);
    directory(full, dirname(full));
    const operations = join(full, "operations");
    directory(operations, full);
    save(full, "run.json", {
      version: 1,
      localRunId,
      manifest: fixed,
      manifestDigest: scheduleManifestDigest(fixed),
      databaseBinding: binding,
    });
    return {
      started: (start) =>
        perform(() => {
          if (
            run ||
            !start ||
            Object.keys(start).sort().join() !== "owner,revision,runId" ||
            !positive(start.owner) ||
            !positive(start.revision) ||
            !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
              start.runId,
            )
          )
            throw Error();
          run = { ...start };
          save(full, "started.json", { version: 1, localRunId, ...run });
        }),
      plan: (scope, receipt) =>
        perform(() => {
          if (
            !run ||
            active ||
            Object.keys(scope).sort().join() !== "key,locale" ||
            !fixed.targets.some((t) => t.key === scope.key && t.locale === scope.locale)
          )
            throw Error();
          const seal = parseReminderEnvelope(receipt);
          if (
            seal.actor !== run.owner ||
            seal.key !== scope.key ||
            seal.locale !== scope.locale ||
            !positive(sequence + 1)
          )
            throw Error();
          const folder = join(operations, String(++sequence).padStart(6, "0"));
          directory(folder, operations);
          const digest = reminderHash(receipt),
            base = { version: 1, sequence, digest };
          save(folder, "receipt", receipt);
          save(folder, "planned.json", { ...base, scope: { ...scope } });
          active = true;
          let phase = 0;
          const advance = (expected: number, name: string, data: object) =>
            perform(() => {
              if (phase !== expected) throw Error();
              save(folder, name, { ...base, ...data });
              phase++;
            });
          return {
            prepared: (revision) => {
              if (!positive(revision)) throw scheduleFileError();
              advance(0, "prepared.json", { revision });
            },
            applying: () => advance(1, "applying.json", {}),
            finished: (revision, asOf) => {
              if (
                !positive(revision) ||
                typeof asOf !== "string" ||
                !Number.isFinite(Date.parse(asOf)) ||
                new Date(asOf).toISOString() !== asOf
              )
                throw scheduleFileError();
              advance(2, "finished.json", { revision, asOf });
              closeSync(anchors.get(folder)!.fd);
              anchors.delete(folder);
              for (const name of files.keys()) if (dirname(name) === folder) files.delete(name);
              active = false;
            },
          };
        }),
      stopped: () =>
        perform(() => {
          if (!run) throw Error();
          save(full, "stopped.json", { version: 1, localRunId });
          ended = true;
        }),
      close,
    };
  } catch {
    try {
      close();
    } catch {
      /* Preserve the creation failure. */
    }
    throw scheduleFileError();
  }
}
