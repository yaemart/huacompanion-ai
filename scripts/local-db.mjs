import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
const root = resolve(".local");
mkdirSync(root, { recursive: true, mode: 0o700 });
const bin = process.env.PG_BIN || "/opt/homebrew/opt/postgresql@15/bin";
const data = resolve(root, "postgres");
const env = resolve(".env");
const port = "55438";
const run = (name, args, opts = {}) =>
  execFileSync(`${bin}/${name}`, args, { stdio: "pipe", ...opts });
if (!existsSync(env)) {
  const password = randomBytes(30).toString("hex");
  writeFileSync(
    env,
    `DATABASE_URL=postgresql://hua:${password}@127.0.0.1:${port}/hua_companion\n` +
      `PAYLOAD_SECRET=${randomBytes(48).toString("hex")}\n` +
      "APP_URL=http://127.0.0.1:3000\nAPP_ENV=local\nNEXT_PUBLIC_FORM_MODE=local\n",
    { mode: 0o600, flag: "wx" },
  );
}
const source = readFileSync(env, "utf8");
const url = new URL(source.match(/^DATABASE_URL=(.+)$/m)[1]);
if (url.hostname !== "127.0.0.1" || url.port !== port || url.pathname !== "/hua_companion")
  throw Error("Refusing to manage a database other than the dedicated local instance.");
if (!existsSync(resolve(data, "PG_VERSION"))) {
  const pw = resolve(root, "pg-init-password");
  writeFileSync(pw, decodeURIComponent(url.password), { mode: 0o600 });
  run("initdb", [
    "-D",
    data,
    "-U",
    "hua",
    "--auth=scram-sha-256",
    `--pwfile=${pw}`,
    "--encoding=UTF8",
    "--locale=C",
  ]);
  const { unlinkSync } = await import("node:fs");
  unlinkSync(pw);
}
const { status } = await import("node:process").then(() => ({
  status: (() => {
    try {
      run("pg_ctl", ["-D", data, "status"]);
      return true;
    } catch {
      return false;
    }
  })(),
}));
if (!status)
  run("pg_ctl", [
    "-D",
    data,
    "-l",
    resolve(root, "postgres.log"),
    "-o",
    `-h 127.0.0.1 -p ${port} -c unix_socket_directories=""`,
    "start",
  ]);
const pgEnv = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };
try {
  run("createdb", ["-h", "127.0.0.1", "-p", port, "-U", "hua", "hua_companion"], { env: pgEnv });
} catch (e) {
  if (!String(e.stderr).includes("already exists"))
    throw new Error("Local database creation failed; see local logs.");
}
console.log("华伴专用 PostgreSQL 已就绪：127.0.0.1:55438。密钥保存在被 Git 忽略的 .env 中。");
