import { randomUUID } from "node:crypto";
import fs from "node:fs";
import type { Stats } from "node:fs";
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
  sameScheduleStat,
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
    active = false,
    activeFolder: string | undefined;
  const pin = (name: string, privateDirectory: boolean) => {
    if (!fs.constants.O_DIRECTORY || !fs.constants.O_NOFOLLOW) throw Error();
    const observed = fs.lstatSync(name);
    const fd = fs.openSync(
      name,
      fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
    );
    const stat = fs.fstatSync(fd);
    anchors.set(name, { fd, stat, private: privateDirectory });
    if (!sameScheduleStat(observed, stat)) throw Error();
    return fd;
  };
  const check = () => {
    if (closed || broken || ended) throw Error();
    assertNewScheduleDirectory(created ? join(full, ".guard-" + localRunId) : full);
    for (const [name, a] of anchors) {
      const s = fs.lstatSync(name),
        opened = fs.fstatSync(a.fd);
      if (
        !s.isDirectory() ||
        s.uid !== process.getuid!() ||
        (a.private && (s.mode & 0o7777) !== 0o700) ||
        !sameScheduleStat(s, a.stat) ||
        !sameScheduleStat(opened, s)
      )
        throw Error();
    }
    for (const folder of [full, ...(activeFolder ? [activeFolder] : [])]) {
      const stages =
        folder === full
          ? ["run.json", "started.json", "stopped.json"]
          : ["receipt", "planned.json", "prepared.json", "applying.json", "finished.json"];
      for (const stage of stages) {
        const name = join(folder, stage);
        if (!files.has(name) && fs.lstatSync(name, { throwIfNoEntry: false })) throw Error();
      }
    }
    for (const [name, record] of files) {
      const { bytes, stat } = readScheduleBytes(name);
      if (!sameScheduleStat(stat, record.stat, true) || !bytes.equals(record.bytes)) throw Error();
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
      fd = fs.openSync(
        temporary,
        fs.constants.O_WRONLY |
          fs.constants.O_CREAT |
          fs.constants.O_EXCL |
          fs.constants.O_NOFOLLOW,
        0o600,
      );
      fs.fchmodSync(fd, 0o600);
      fs.writeFileSync(fd, bytes);
      fs.fsyncSync(fd);
      const closing = fd;
      fd = undefined;
      fs.closeSync(closing);
      check();
      fs.linkSync(temporary, target);
      fs.unlinkSync(temporary);
      fs.fsyncSync(anchors.get(folder)!.fd);
      files.set(target, { bytes, stat: fs.lstatSync(target) });
      check();
    } finally {
      if (fd !== undefined) {
        try {
          fs.closeSync(fd);
        } catch {
          /* Preserve the save failure. */
        }
      }
    }
  };
  const directory = (name: string, parent: string) => {
    check();
    fs.mkdirSync(name, { mode: 0o700 });
    if (name === full) created = true;
    const fd = pin(name, true);
    fs.fsyncSync(fd);
    fs.fsyncSync(anchors.get(parent)!.fd);
    check();
    return fd;
  };
  const close = () => {
    if (closed) return;
    closed = true;
    let failed = false;
    for (const a of anchors.values()) {
      try {
        fs.closeSync(a.fd);
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
          activeFolder = folder;
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
            finished: (revision, asOf) =>
              perform(() => {
                if (
                  !positive(revision) ||
                  typeof asOf !== "string" ||
                  !Number.isFinite(Date.parse(asOf)) ||
                  new Date(asOf).toISOString() !== asOf
                )
                  throw scheduleFileError();
                advance(2, "finished.json", { revision, asOf });
                const closing = anchors.get(folder)!.fd;
                anchors.delete(folder);
                fs.closeSync(closing);
                activeFolder = undefined;
                for (const name of files.keys()) if (dirname(name) === folder) files.delete(name);
                active = false;
              }),
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
