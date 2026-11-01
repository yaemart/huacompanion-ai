import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  createReadStream,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { setImmediate } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

const root = fileURLToPath(new URL("..", import.meta.url));
const docker = process.env.DOCKER_BIN || "docker";
const envFile = path.join(root, ".env.compose");
const settings = parse(readFileSync(envFile));
const localProject = "hua-trial-local";
const base = ["compose", "--env-file", envFile, "--project-name", localProject];
const run = (args, options = {}) =>
  execFileSync(docker, args, {
    cwd: root,
    maxBuffer: 32 * 1024 * 1024,
    timeout: 180000,
    ...options,
  });
const compose = (args, options) => run([...base, ...args], options);
const backupRoot = path.join(root, "backups/compose");
async function checksum(filename) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}

// Refuse remote daemons: this utility is for the isolated local Compose simulation.
const endpoint = run(["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"])
  .toString()
  .trim();
if (process.env.DOCKER_HOST || !endpoint.startsWith("unix://"))
  throw Error("Use a local Unix-socket Docker context with DOCKER_HOST unset");

function archive(args, filename) {
  const fd = openSync(filename, "wx", 0o600);
  try {
    compose(args, { stdio: ["ignore", fd, "pipe"] });
  } finally {
    closeSync(fd);
  }
}
const writers = ["web", "support-worker", "workflow-worker"];
let interrupted = false;
function onSignal(signal) {
  interrupted = true;
  process.exitCode = signal === "SIGINT" ? 130 : 143;
}
process.on("SIGINT", onSignal);
process.on("SIGTERM", onSignal);
async function interruptPoint() {
  await setImmediate();
  if (interrupted) throw Error("Backup interrupted; original writers will be resumed");
}
function writerStates() {
  const output = compose(["ps", "--all", "--format", "json"]).toString().trim();
  const rows = !output
    ? []
    : output.startsWith("[")
      ? JSON.parse(output)
      : output.split("\n").map((line) => JSON.parse(line));
  return rows.filter((row) => writers.includes(row.Service));
}
async function capture() {
  const states = writerStates();
  if (states.some((row) => row.State === "paused"))
    throw Error("Unpause writers before paired backup");
  const active = states
    .filter((row) => ["running", "restarting"].includes(row.State))
    .map((row) => row.Service);
  const directory = path.join(
    backupRoot,
    new Date().toISOString().replaceAll(":", "-") + "-" + randomBytes(3).toString("hex"),
  );
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  try {
    console.log(
      "Stopping all writers. Forced-kill recovery: docker compose --env-file .env.compose start web support-worker workflow-worker",
    );
    compose(["stop", ...writers], { stdio: "pipe" });
    await interruptPoint();
    if (writerStates().some((row) => ["running", "restarting", "paused"].includes(row.State)))
      throw Error("A writer is still active; paired backup refused");
    const inventory = JSON.parse(
      compose(["run", "--rm", "--no-deps", "-T", "web", "node", "scripts/backup-inventory.mjs"]),
    );
    await interruptPoint();
    archive(
      [
        "exec",
        "-T",
        "db",
        "pg_dump",
        "-U",
        settings.POSTGRES_USER,
        "-d",
        settings.POSTGRES_DB,
        "-Fc",
        "--no-owner",
        "--no-acl",
      ],
      path.join(directory, "database.dump"),
    );
    await interruptPoint();
    archive(
      [
        "run",
        "--rm",
        "--no-deps",
        "-T",
        "--entrypoint",
        "tar",
        "web",
        "-czf",
        "-",
        "-C",
        "/app/.local/content-media",
        ".",
      ],
      path.join(directory, "media.tgz"),
    );
    await interruptPoint();
    const manifest = {
      version: 1,
      project: localProject,
      createdAt: new Date().toISOString(),
      image: compose(["images", "-q", "web"]).toString().trim(),
      databaseSha256: await checksum(path.join(directory, "database.dump")),
      mediaSha256: await checksum(path.join(directory, "media.tgz")),
      inventory,
    };
    writeFileSync(path.join(directory, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", {
      mode: 0o600,
    });
    console.log("Paired backup created:", directory);
    return directory;
  } finally {
    if (active.length) compose(["start", ...active], { stdio: "pipe" });
  }
}
async function verify(input) {
  const directory = path.resolve(input);
  if (!directory.startsWith(backupRoot + path.sep))
    throw Error("Select a local paired backup under backups/compose");
  const manifest = JSON.parse(readFileSync(path.join(directory, "manifest.json"), "utf8"));
  assert.equal(manifest.version, 1);
  assert.equal(manifest.project, localProject);
  assert.equal(await checksum(path.join(directory, "database.dump")), manifest.databaseSha256);
  assert.equal(await checksum(path.join(directory, "media.tgz")), manifest.mediaSha256);
  const project = "hua-restore-check-" + randomBytes(8).toString("hex");
  const target = [
    "compose",
    "--env-file",
    envFile,
    "--project-name",
    project,
    "-f",
    "docker/restore-compose.yml",
  ];
  const restore = (args, options) => run([...target, ...args], options);
  try {
    restore(["up", "-d", "--wait", "--wait-timeout", "90", "db"], { stdio: "pipe" });
    await interruptPoint();
    const dump = openSync(path.join(directory, "database.dump"), "r");
    try {
      restore(
        [
          "exec",
          "-T",
          "db",
          "pg_restore",
          "-U",
          settings.POSTGRES_USER,
          "-d",
          settings.POSTGRES_DB,
          "--exit-on-error",
          "--no-owner",
          "--no-acl",
        ],
        { stdio: [dump, "pipe", "pipe"] },
      );
    } finally {
      closeSync(dump);
    }
    await interruptPoint();
    const media = openSync(path.join(directory, "media.tgz"), "r");
    try {
      restore(
        [
          "run",
          "--rm",
          "--no-deps",
          "-T",
          "--entrypoint",
          "tar",
          "verify",
          "-xzf",
          "-",
          "-C",
          "/app/.local/content-media",
        ],
        { stdio: [media, "pipe", "pipe"] },
      );
    } finally {
      closeSync(media);
    }
    await interruptPoint();
    const actual = JSON.parse(restore(["run", "--rm", "--no-deps", "-T", "verify"]));
    assert.deepEqual(
      actual,
      manifest.inventory,
      "Restored table rows and all media bytes must match the paired snapshot",
    );
    console.log(
      "PASS isolated restore: all table row hashes, counts, media hashes and references match.",
    );
    return {
      tables: Object.keys(actual.tables).length,
      mediaFiles: Object.keys(actual.media).length,
    };
  } finally {
    // Only the randomly named verification project's own volumes are deleted.
    restore(["down", "--volumes", "--remove-orphans"], { stdio: "pipe" });
  }
}
const [action, location] = process.argv.slice(2);
try {
  if (action === "backup") await capture();
  else if (action === "verify" && location) await verify(location);
  else if (action === "roundtrip") {
    const directory = await capture();
    await interruptPoint();
    const result = await verify(directory);
    writeFileSync(
      path.join(directory, "restore-verification.json"),
      JSON.stringify({ verifiedAt: new Date().toISOString(), ...result }, null, 2) + "\n",
      { mode: 0o600 },
    );
  } else throw Error("Use backup, verify <backups/compose/path>, or roundtrip");
} catch (error) {
  if (!interrupted) throw error;
  console.error(
    "Interrupted; writer restart and isolated cleanup were attempted. Use the recovery command above if needed.",
    { error: error.name, status: error.status ?? "unknown" },
  );
} finally {
  process.removeListener("SIGINT", onSignal);
  process.removeListener("SIGTERM", onSignal);
}
