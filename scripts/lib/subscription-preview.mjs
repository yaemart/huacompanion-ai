import { spawn } from "node:child_process";
import { once } from "node:events";
import { cpSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { resolve } from "node:path";
import { ensureFree } from "./demo-environment.mjs";

export async function subscriptionPreview(baseEnv, signal) {
  const origin = "http://127.0.0.1:3186";
  await ensureFree(3186);
  const app = mkdtempSync(resolve(".local/subscription-preview-"));
  const env = {
    ...baseEnv,
    APP_URL: origin,
    SUBSCRIPTIONS_ENABLED: "true",
    SUBSCRIPTION_REQUESTS_ENABLED: "true",
    SUBSCRIPTION_MAIL_LINKS_VERIFIED: "true",
    WORKFLOW_MAIL_ENABLED: "true",
    WORKFLOW_MAIL_API_KEY: "fictional-preview-only",
    WORKFLOW_MAIL_FROM: "fictional@example.invalid",
    PRIVACY_VERSION: "fictional-preview-v1",
    HUA_DEMO_ROOT: app,
  };
  const children = [];
  try {
    for (const name of [
      "src",
      "scripts",
      "public",
      "package.json",
      "package-lock.json",
      "tsconfig.json",
      "next.config.mjs",
      "next-env.d.ts",
      "payload-types.ts",
    ])
      cpSync(resolve(name), resolve(app, name), { recursive: true });
    symlinkSync(resolve("node_modules"), resolve(app, "node_modules"), "dir");
    signal.throwIfAborted();
    const mail = spawn(
      process.execPath,
      ["--import", "tsx", "tests/integration/subscription-preview.ts"],
      {
        env,
        stdio: ["ignore", "inherit", "inherit", "ipc"],
      },
    );
    children.push(mail);
    await Promise.race([
      once(mail, "message", { signal }),
      once(mail, "exit", { signal }).then(() => {
        throw Error("模拟发件进程未能启动。");
      }),
    ]);
    const web = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "dev",
        "--webpack",
        "--hostname",
        "127.0.0.1",
        "--port",
        "3186",
      ],
      { cwd: app, env: { ...env, NODE_ENV: "development" }, stdio: "inherit" },
    );
    children.push(web);
    console.log(`订阅演示 ${origin}/zh 或 ${origin}/en。请使用示例邮箱 name@example.invalid。`);
    console.log("模拟确认链接会显示在这里。按 Ctrl+C 关闭并清理临时库。");
    await Promise.race(children.map((child) => once(child, "exit", { signal })));
    throw Error("订阅演示子进程已退出。");
  } catch (error) {
    if (!signal.aborted) throw error;
  } finally {
    await Promise.all(
      children.map(async (child) => {
        if (child.exitCode !== null || child.signalCode !== null) return;
        const exited = once(child, "exit");
        child.kill("SIGTERM");
        await exited;
      }),
    );
    rmSync(app, { recursive: true, force: true });
  }
}
