import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  openSync,
  closeSync,
  cpSync,
  lstatSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { createInterface } from "node:readline/promises";
import { assertDemoInvocation, resolvePostgres, demoWeb, webAddress } from "./lib/demo-runtime.mjs";
import {
  assertDemo,
  assertDemoPaths,
  demoEnvironment,
  prepareApp,
  ensureFree,
  webOwner,
  stopWeb,
  assertPolicyDemoReady,
  prepareCluster,
  describeDemoFailure,
} from "./lib/demo-environment.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const dir = path.join(root, ".local/demo");
const app = path.join(dir, "app");
const file = path.join(dir, "state.json");
const data = path.join(dir, "postgres");
const action = process.argv[2] || "start";
const expectedNode = readFileSync(path.join(root, ".nvmrc"), "utf8").trim().replace(/^v/, "");
if (process.versions.node !== expectedNode)
  throw Error(`请使用Node ${expectedNode}，或双击「华伴演示.command」。`);
if (action === "serve") {
  const state = JSON.parse(readFileSync(file, "utf8"));
  const web = webAddress(process.argv[4]);
  const child = spawn(
    process.execPath,
    [
      path.join(root, "node_modules/next/dist/bin/next"),
      "dev",
      app,
      "--webpack",
      "--hostname",
      web.host,
      "--port",
      "3100",
    ],
    {
      cwd: app,
      env: demoEnvironment(state, app, process.env, web.host),
      stdio: "inherit",
      detached: true,
    },
  );
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, () => {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {}
    });
  child.on("exit", (code) => process.exit(code || 0));
} else {
  if (!["start", "stop", "reset", "setup", "test"].includes(action))
    throw Error("命令应为start/stop/reset。");
  for (const folder of [path.join(root, ".local"), dir]) {
    if (existsSync(folder) && lstatSync(folder).isSymbolicLink())
      throw Error("演示目录不能是符号链接");
  }
  assertDemoPaths(root);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  let lock;
  let secrets = [];
  try {
    if (existsSync(path.join(dir, "busy"))) {
      const pid = Number(readFileSync(path.join(dir, "busy"), "utf8"));
      let alive = true;
      try {
        process.kill(pid, 0);
      } catch (error) {
        alive = error.code !== "ESRCH";
      }
      if (!alive) unlinkSync(path.join(dir, "busy"));
    }
    lock = openSync(path.join(dir, "busy"), "wx", 0o600);
    writeFileSync(lock, String(process.pid));
    assertDemoInvocation(existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null);
    if (!existsSync(file)) {
      if (action !== "start" && action !== "setup") throw Error("演示环境尚未建立，请先启动。");
      if (existsSync(path.join(data, "PG_VERSION")))
        throw Error("演示数据库缺少身份标记，拒绝接管。");
      const password = randomBytes(24).toString("hex");
      const state = {
        marker: "hua-local-demo-v1",
        secret: randomBytes(48).toString("hex"),
        databaseURL: `postgresql://hua_demo:${password}@127.0.0.1:55442/hua_companion_demo`,
        accounts: Object.fromEntries(
          ["admin", "manager", "operations", "reviewer", "newcomer"].map((role) => [
            role,
            {
              email: `${role}@demo.huacompanion.invalid`,
              password: randomBytes(18).toString("base64url"),
            },
          ]),
        ),
        seeded: false,
        clusterInitialized: false,
      };
      writeFileSync(file, JSON.stringify(state), { mode: 0o600, flag: "wx" });
    }
    const state = JSON.parse(readFileSync(file, "utf8"));
    assertDemo(state);
    const web = demoWeb(process.argv.includes("--lan"));
    secrets = [
      state.secret,
      decodeURIComponent(new URL(state.databaseURL).password),
      ...Object.values(state.accounts).map((account) => account.password),
    ];
    if (
      ["start", "setup", "reset"].includes(action) &&
      !existsSync(path.join(root, "node_modules/next/package.json"))
    ) {
      console.log("首次安装锁定依赖，请稍候……");
      execFileSync("npm", ["ci", "--no-audit", "--no-fund"], { cwd: root, stdio: "inherit" });
    }
    const env = demoEnvironment(state, app, process.env, web.host);
    const bin = resolvePostgres(data);
    const pg = (tool, args = []) =>
      execFileSync(path.join(bin, tool), args, {
        env: { ...env, PGPASSWORD: decodeURIComponent(new URL(state.databaseURL).password) },
        encoding: "utf8",
        stdio: "pipe",
      });
    const args = ["-h", "127.0.0.1", "-p", "55442", "-U", "hua_demo"];
    const running = () => {
      try {
        pg("pg_ctl", ["-D", data, "status"]);
        return true;
      } catch {
        return false;
      }
    };
    const verifyDatabase = () => {
      const actual = pg("psql", [...args, "-d", "postgres", "-Atc", "SHOW data_directory"]).trim();
      if (actual !== data) throw Error("数据库目录不匹配，拒绝修改。");
    };
    const stop = async () => {
      await stopWeb(dir);
      if (running()) {
        verifyDatabase();
        pg("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
      }
    };
    if (action === "test") {
      if (!state.seeded || !running()) throw Error("请先启动演示环境，再运行test:demo。");
      verifyDatabase();
      execFileSync(
        process.execPath,
        ["--import", "tsx", path.join(root, "tests/integration/local-demo.ts")],
        {
          cwd: app,
          env,
          stdio: "inherit",
        },
      );
    } else if (action === "stop") {
      await stop();
      console.log("演示网站和数据库已关闭，原站点不受影响。");
    } else {
      if (action === "reset") {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const answer = await rl.question("仅清除演示测试修改并恢复初始数据。输入 RESET 确认：");
        rl.close();
        if (answer !== "RESET") throw Object.assign(Error("已取消"), { code: "DEMO_CANCELLED" });
        await stopWeb(dir);
        if (!state.accounts.newcomer) {
          state.accounts.newcomer = {
            email: "newcomer@demo.huacompanion.invalid",
            password: randomBytes(18).toString("base64url"),
          };
        }
      } else if (webOwner(dir)) {
        console.log("演示已在运行；切换本机/手机模式前请先运行npm run local:stop。");
        process.exitCode = 0;
      }
      if (!webOwner(dir)) {
        await ensureFree(3100, web.host);
        if (!running()) {
          await ensureFree(55442);
          const cluster = prepareCluster(root, state);
          if (cluster.quarantine) console.log("首次建库的未完成目录已保留，正在重新初始化。");
          if (cluster.initialize) {
            const pw = path.join(dir, "init-password");
            writeFileSync(pw, decodeURIComponent(new URL(state.databaseURL).password), {
              mode: 0o600,
            });
            try {
              pg("initdb", [
                "-D",
                data,
                "-U",
                "hua_demo",
                "--auth=scram-sha-256",
                `--pwfile=${pw}`,
                "--encoding=UTF8",
                "--locale=C",
              ]);
            } finally {
              unlinkSync(pw);
            }
          }
          state.clusterInitialized = true;
          writeFileSync(file, JSON.stringify(state), { mode: 0o600 });
          pg("pg_ctl", [
            "-D",
            data,
            "-l",
            path.join(dir, "postgres.log"),
            "-o",
            "-h 127.0.0.1 -p 55442 -c unix_socket_directories=''",
            "-w",
            "start",
          ]);
        }
        const actual = pg("psql", [
          ...args,
          "-d",
          "postgres",
          "-Atc",
          "SHOW data_directory",
        ]).trim();
        if (actual !== data) throw Error("数据库目录不匹配，拒绝修改。");
        const databaseExists = () =>
          pg("psql", [
            ...args,
            "-d",
            "postgres",
            "-Atc",
            "SELECT 1 FROM pg_database WHERE datname='hua_companion_demo'",
          ]).trim() === "1";
        if (action === "reset") {
          const backup = path.join(root, ".local/backups", `demo-${Date.now()}`);
          mkdirSync(backup, { mode: 0o700, recursive: true });
          if (databaseExists())
            pg("pg_dump", [
              ...args,
              "-Fc",
              "-f",
              path.join(backup, "database.dump"),
              "hua_companion_demo",
            ]);
          if (existsSync(path.join(app, ".local/content-media")))
            cpSync(path.join(app, ".local/content-media"), path.join(backup, "media"), {
              recursive: true,
            });
          state.seeded = false;
          state.migrationsApplied = false;
          writeFileSync(file, JSON.stringify(state), { mode: 0o600 });
          if (databaseExists()) pg("dropdb", [...args, "--force", "hua_companion_demo"]);
          const media = path.join(app, ".local/content-media");
          if (existsSync(media) && lstatSync(media).isSymbolicLink())
            throw Error("演示媒体目录不能是符号链接");
          rmSync(media, { recursive: true, force: true });
        }
        if (!databaseExists()) pg("createdb", [...args, "hua_companion_demo"]);
        assertPolicyDemoReady(state);
        if (
          state.seeded &&
          pg("psql", [
            ...args,
            "-d",
            "hua_companion_demo",
            "-Atc",
            "SELECT (SELECT count(*) FROM imm_policies)=0 " +
              "AND (SELECT count(*) FROM content_drafts WHERE kind='immigration-policy')=0 " +
              "AND (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('policy_shared_guard','policy_shared_immutable'))=7 " +
              "AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='workflow_tasks' AND column_name='policy_group_id')",
          ]).trim() !== "t"
        )
          throw Error("政策迁移或旧数据检查未通过；未启动网站，请保留现场。");
        if (
          state.seeded &&
          pg("psql", [
            ...args,
            "-d",
            "hua_companion_demo",
            "-Atc",
            "SELECT count(*)=8 FROM information_schema.columns WHERE table_schema='public' " +
              "AND table_name='public_company_settings' AND column_name IN " +
              "('id','company_name','location_zh','location_en','email','phone','created_at','updated_at')",
          ]).trim() !== "t"
        )
          throw Error(
            "公开公司信息尚未迁移；请先配套备份并由开发者执行20261108_220000_public_company，勿reset。",
          );
        if (
          state.seeded &&
          pg("psql", [
            ...args,
            "-d",
            "hua_companion_demo",
            "-Atc",
            "SELECT count(*)=2 FROM information_schema.columns WHERE table_schema='public' " +
              "AND table_name='workflow_settings' AND column_name IN ('inquiry_reply_zh','inquiry_reply_en')",
          ]).trim() !== "t"
        )
          throw Error(
            "咨询回执尚未迁移；请先配套备份并由开发者执行20261109_080000_inquiry_reply，勿reset。",
          );
        if (
          state.seeded &&
          pg("psql", [
            ...args,
            "-d",
            "hua_companion_demo",
            "-Atc",
            "SELECT count(*)=4 FROM information_schema.columns WHERE table_schema='public' AND " +
              "((table_name IN ('inquiries','providers') AND column_name='follow_ups') OR " +
              "(table_name IN ('_inquiries_v','_providers_v') AND column_name='version_follow_ups'))",
          ]).trim() !== "t"
        )
          throw Error(
            "跟进时间线尚未迁移；请先配套备份并执行20261109_120000_intake_followups，勿reset。",
          );
        if (
          state.seeded &&
          pg("psql", [
            ...args,
            "-d",
            "hua_companion_demo",
            "-Atc",
            "SELECT to_regclass('public.quote_template_settings') IS NOT NULL AND " +
              "to_regclass('public.quote_template_settings_templates') IS NOT NULL",
          ]).trim() !== "t"
        )
          throw Error(
            "报价模板尚未迁移；请先配套备份并执行20261111_100000_quote_templates，勿reset。",
          );
        prepareApp(root);
        const accounts = Object.entries(state.accounts)
          .map(([role, value]) => `${role}：${value.email}\n密码：${value.password}`)
          .join("\n\n");
        writeFileSync(
          path.join(dir, "accounts.txt"),
          "仅本机演示使用，不要上传截图或分享密码。\n\n" + accounts + "\n",
          { mode: 0o600 },
        );
        writeFileSync(
          path.join(root, ".local/test-accounts.txt"),
          "仅本机虚构演示，密码不要转发。\n\n" + accounts + "\n",
          { mode: 0o600 },
        );
        if (!state.seeded) {
          const log = openSync(path.join(dir, "seed.log"), "a", 0o600);
          try {
            if (!state.migrationsApplied) {
              execFileSync(process.execPath, ["--import", "tsx", "scripts/demo-migrate.ts"], {
                cwd: app,
                env: { ...env, HUA_DEMO_SCHEMA_PUSH: "false" },
                stdio: ["ignore", log, log],
              });
              state.migrationsApplied = true;
              writeFileSync(file, JSON.stringify(state), { mode: 0o600 });
            }
            execFileSync(process.execPath, ["--import", "tsx", "scripts/demo-seed.ts"], {
              cwd: app,
              env,
              stdio: ["ignore", log, log],
            });
          } finally {
            closeSync(log);
          }
          state.seeded = true;
          state.seedVersion = 3;
          state.policySeedVersion = 1;
          writeFileSync(file, JSON.stringify(state), { mode: 0o600 });
        }
        if (action !== "setup") {
          const token = randomBytes(16).toString("hex");
          const log = openSync(path.join(dir, "web.log"), "a", 0o600);
          const child = spawn(
            process.execPath,
            [fileURLToPath(import.meta.url), "serve", token, web.host],
            {
              cwd: app,
              env,
              detached: true,
              stdio: ["ignore", log, log],
            },
          );
          closeSync(log);
          writeFileSync(
            path.join(dir, "web.json"),
            JSON.stringify({ pid: child.pid, token, host: web.host }),
            {
              mode: 0o600,
            },
          );
          child.unref();
          let ready = false;
          for (let i = 0; i < 180; i++) {
            try {
              ready = (
                await fetch(`${web.url}/zh`, {
                  signal: globalThis.AbortSignal.timeout(2000),
                })
              ).ok;
            } catch {}
            if (ready) break;
            if (!webOwner(dir)) throw Error("演示启动退出，请查看.local/demo/web.log。");
            await delay(500);
          }
          if (!ready) {
            await stop();
            throw Error("演示启动超时，请查看.local/demo/web.log。");
          }
        }
        console.log(
          `演示已就绪：${web.url}/zh\n后台：${web.url}/admin\n账号密码：.local/test-accounts.txt\n关闭：npm run local:stop；重置：npm run local:reset`,
        );
        if (state.seedVersion !== 3)
          console.log("当前为旧演示数据。启动保留修改；备份并运行local:reset后可载入新版样例。");
        if (web.host !== "127.0.0.1")
          console.log(
            "临时私网模式：仅可信Wi-Fi、虚构数据；用完local:stop，再普通local:start恢复仅本机。",
          );
        if (
          action !== "setup" &&
          process.platform === "darwin" &&
          !process.argv.includes("--no-open")
        ) {
          try {
            execFileSync("open", [`${web.url}/zh`], { stdio: "ignore" });
          } catch {
            console.log("请手动打开上述网址。");
          }
        }
      }
    }
  } catch (error) {
    const failure = describeDemoFailure(error, secrets);
    if (failure.exitCode) {
      try {
        const log = openSync(path.join(dir, "control.log"), "a", 0o600);
        writeFileSync(
          log,
          `${new Date().toISOString()} ${failure.message}\n${failure.diagnostics}\n`,
        );
        closeSync(log);
      } catch {}
    }
    console.error(error.code === "EEXIST" ? "另一演示操作正在进行，请稍后重试。" : failure.message);
    process.exitCode = failure.exitCode;
  } finally {
    if (lock !== undefined) {
      closeSync(lock);
      unlinkSync(path.join(dir, "busy"));
    }
  }
}
