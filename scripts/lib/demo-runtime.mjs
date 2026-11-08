import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { networkInterfaces } from "node:os";

/** @param {Record<string, string | undefined>} env */
export function assertDemoInvocation(state, env = process.env) {
  if (env.APP_ENV && env.APP_ENV !== "local") throw Error("演示命令只允许本地APP_ENV=local。");
  if (env.DATABASE_URL && env.DATABASE_URL !== state?.databaseURL)
    throw Error("DATABASE_URL不是本工具的本地专用实例；请移除该环境变量后再操作。");
}
/** @param {Record<string, string | undefined>} env */
export function resolvePostgres(data, env = process.env) {
  const versionFile = join(data, "PG_VERSION");
  const required = existsSync(versionFile) ? readFileSync(versionFile, "utf8").trim() : null;
  if (required && !["15", "16"].includes(required))
    throw Error("演示仅支持PG15/16，不自动升级已有数据库。");
  const candidates = [];
  if (env.PG_BIN) candidates.push(env.PG_BIN);
  else
    for (const major of required ? [required] : ["15", "16"]) {
      try {
        candidates.push(
          join(
            execFileSync("brew", ["--prefix", `postgresql@${major}`], {
              encoding: "utf8",
              stdio: "pipe",
              env,
            }).trim(),
            "bin",
          ),
        );
      } catch {}
    }
  for (const bin of candidates) {
    if (!env.PG_BIN && !existsSync(join(bin, "postgres"))) continue;
    const version = execFileSync(join(bin, "postgres"), ["--version"], {
      encoding: "utf8",
      stdio: "pipe",
    });
    const major = version.match(/PostgreSQL\)?\s+(\d+)/)?.[1];
    if (!["15", "16"].includes(major)) throw Error("演示需要PostgreSQL15或16。");
    if (required && major !== required)
      throw Error(`已有库PG${required}，工具PG${major}；请使用匹配版本，不自动升级。`);
    return bin;
  }
  throw Error(
    `未找到PostgreSQL${required || "15/16"}。请先运行 brew install postgresql@${required || "15"}，或配置PG_BIN。`,
  );
}
export function privateHost(host) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(String(host))) return false;
  const parts = String(host).split(".").map(Number);
  return (
    parts.length === 4 &&
    parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) &&
    (parts[0] === 10 ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31))
  );
}
export function webAddress(host = "127.0.0.1") {
  if (host !== "127.0.0.1" && !privateHost(host))
    throw Error("只允许本机或私网IPv4地址，不开放公网。");
  return { host, url: `http://${host}:3100` };
}
export function demoWeb(lan = false, interfaces = networkInterfaces()) {
  if (!lan) return webAddress();
  const address = Object.values(interfaces)
    .flat()
    .find((i) => i && i.family === "IPv4" && !i.internal && privateHost(i.address));
  if (!address) throw Error("未找到同Wi-Fi私网IPv4地址，请连接可信Wi-Fi后再试。");
  return webAddress(address.address);
}
