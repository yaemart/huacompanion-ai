import "dotenv/config";
import type { Config } from "payload";
import {
  MockWorkerInputError,
  parseMockWorkerArgs,
  requireLocalMockWorker,
} from "../src/lib/subscription-mock-worker-options";
let stopped = false;
let status = 0;
let payload: import("payload").Payload | undefined;
process.once("SIGINT", () => {
  stopped = true;
});
process.once("SIGTERM", () => {
  stopped = true;
});
try {
  requireLocalMockWorker();
  const options = parseMockWorkerArgs(process.argv.slice(2));
  // This command consumes existing migrated data; it must never synchronize a local schema.
  process.env.HUA_DEMO_SCHEMA_PUSH = "false";
  const { getPayload } = await import("payload");
  const { default: config } = await import("../src/payload.config");
  const { createMockCampaignWorker } = await import("../src/server/subscription-campaign-worker");
  const localOnly = {
    telemetry: false,
    logger: { options: { level: "silent" } },
  } satisfies Pick<Config, "telemetry" | "logger">;
  const localConfig = Object.assign({}, await config, localOnly);
  payload = await getPayload({ config: localConfig });
  const tick = createMockCampaignWorker(payload, options);
  while (!stopped) {
    console.log(JSON.stringify(await tick()));
    if (options.once || stopped) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
} catch (error) {
  status = 1;
  console.error(
    error instanceof MockWorkerInputError
      ? error.message
      : "本地模拟worker已安全停止，请核对当前活动与权限。",
  );
} finally {
  try {
    await payload?.destroy();
  } catch {
    status = 1;
    console.error("本地模拟worker关闭失败，请核对本地进程。");
  }
}
process.exit(status);
