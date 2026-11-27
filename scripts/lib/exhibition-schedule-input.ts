import { createHash } from "node:crypto";
import { constants, closeSync, fstatSync, lstatSync, openSync, readSync } from "node:fs";
import type { Stats } from "node:fs";
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { isContentIdentifier } from "../../src/lib/content-identifiers.ts";
import type { ReminderScope } from "../../src/lib/exhibition-reminders.ts";

export const sameScheduleStat = (a: Stats, b: Stats, file = false) =>
  ["dev", "ino", "uid", "mode", ...(file ? ["nlink", "size", "mtimeMs", "ctimeMs"] : [])].every(
    (k) => a[k as keyof Stats] === b[k as keyof Stats],
  );
export class ScheduleFileError extends Error {}
export const scheduleFileError = () =>
  new ScheduleFileError("私有调度文件或目录无效，请保留原证据并核对权限与路径。");
export type ScheduleManifest = {
  readonly version: 1;
  readonly targets: ReadonlyArray<Readonly<ReminderScope>>;
};
const exact = (value: unknown, keys: string[]): value is Record<string, unknown> =>
  !!value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join() === keys.join();
export function parseScheduleManifest(value: unknown): ScheduleManifest {
  if (
    !exact(value, ["targets", "version"]) ||
    value.version !== 1 ||
    !Array.isArray(value.targets) ||
    value.targets.length < 1 ||
    value.targets.length > 20
  )
    throw scheduleFileError();
  const targets = value.targets.map((t) => {
    if (
      !exact(t, ["key", "locale"]) ||
      !isContentIdentifier(t.key) ||
      (t.locale !== "zh" && t.locale !== "en")
    )
      throw scheduleFileError();
    return Object.freeze({ key: t.key, locale: t.locale });
  });
  const key = (t: ReminderScope) => JSON.stringify([t.key, t.locale]);
  targets.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  if (targets.some((t, i) => i > 0 && key(t) === key(targets[i - 1]))) throw scheduleFileError();
  return Object.freeze({ version: 1, targets: Object.freeze(targets) });
}
export function scheduleManifestDigest(manifest: ScheduleManifest) {
  return createHash("sha256")
    .update(JSON.stringify(parseScheduleManifest(manifest)), "utf8")
    .digest("hex");
}
export function readScheduleBytes(path: string) {
  let fd: number | undefined;
  try {
    if (typeof process.getuid !== "function" || !constants.O_NOFOLLOW || !constants.O_NONBLOCK)
      throw Error();
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const before = fstatSync(fd);
    const valid = (s: typeof before) =>
      s.isFile() &&
      s.uid === process.getuid!() &&
      (s.mode & 0o7777) === 0o600 &&
      s.nlink === 1 &&
      s.size > 0 &&
      s.size <= 16384;
    if (!valid(before)) throw Error();
    const data = Buffer.alloc(16385),
      length = readSync(fd, data, 0, data.length, 0);
    const after = fstatSync(fd),
      named = lstatSync(path);
    for (const s of [after, named]) {
      if (!valid(s) || !sameScheduleStat(s, before, true)) throw Error();
    }
    if (length !== before.size) throw Error();
    const closing = fd;
    fd = undefined;
    closeSync(closing);
    return { bytes: data.subarray(0, length), stat: after };
  } catch {
    throw scheduleFileError();
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
export function readScheduleManifest(path: string): ScheduleManifest {
  try {
    return parseScheduleManifest(
      JSON.parse(
        new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
          readScheduleBytes(path).bytes,
        ),
      ),
    );
  } catch {
    throw scheduleFileError();
  }
}
export function assertNewScheduleDirectory(path: string): string {
  try {
    if (
      typeof process.getuid !== "function" ||
      typeof path !== "string" ||
      !path.trim() ||
      path.includes("\0")
    )
      throw Error();
    const full = resolve(path),
      parent = dirname(full),
      uid = process.getuid();
    let cursor = parse(full).root;
    if (!isAbsolute(full) || full === cursor) throw Error();
    for (const part of ["", ...relative(cursor, parent).split(sep).filter(Boolean)]) {
      cursor = join(cursor, part);
      const s = lstatSync(cursor);
      if (!s.isDirectory() || ![0, uid].includes(s.uid) || s.mode & 0o022) throw Error();
    }
    if (lstatSync(parent).uid !== uid || lstatSync(full, { throwIfNoEntry: false })) throw Error();
    return full;
  } catch {
    throw scheduleFileError();
  }
}
