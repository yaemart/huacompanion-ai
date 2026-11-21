import { spawn } from "node:child_process";
import { once } from "node:events";
import { cpSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { resolve } from "node:path";
import { ensureFree } from "./demo-environment.mjs";

export async function subscriptionPreview(baseEnv, signal, isolatedBrowser = false) {
  const origin = `http://${isolatedBrowser ? "localhost" : "127.0.0.1"}:3186`;
  await ensureFree(3186);
  const app = mkdtempSync(resolve(".local/subscription-preview-"));
  const env = {
    ...baseEnv,
    APP_URL: origin,
    NODE_ENV: "production",
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
    // Build both root layouts together before serving their shared client references.
    console.log("正在构建隔离预览，请等待构建完成后再打开页面。");
    const build = spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "build", "--webpack"],
      { cwd: app, env, stdio: "inherit" },
    );
    children.push(build);
    const [code] = await Promise.race([
      once(build, "exit", { signal }),
      once(mail, "exit", { signal }).then(() => {
        throw Error("模拟发件进程已退出，预览未启动。");
      }),
    ]);
    if (code !== 0) throw Error("隔离预览构建失败，请查看上方错误后重新启动。");
    signal.throwIfAborted();
    const web = spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3186"],
      { cwd: app, env, stdio: "inherit" },
    );
    children.push(web);
    console.log(`订阅演示 ${origin}/zh 或 ${origin}/en。请使用示例邮箱 name@example.invalid。`);
    console.log("模拟确认链接会显示在这里。按 Ctrl+C 关闭并清理临时库。");
    await Promise.race([mail, web].map((child) => once(child, "exit", { signal })));
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
