import "dotenv/config";
import type { Config, Payload } from "payload";
import {
  ReminderCommandError,
  parseReminderCommand,
  readReminderFile,
  assertNewReminderReceipt,
  saveReminderReceipt,
  formatReminderReport,
} from "./lib/exhibition-reminder-command";
let payload: Payload | undefined;
let exitCode = 0;
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log(
      [
        "管理员本地提醒：只预检或核实本地待发，未发送邮件。",
        "preview --key KEY --locale zh|en --auth-file PATH --receipt-file NEW_PATH",
        "apply --auth-file PATH --receipt-file PATH",
        "inspect --auth-file PATH --receipt-file PATH（真正只读核实）",
        "scheduler-resolve --auth-file PATH --revision N --reason TEXT（仅核实结束，不代执行）",
        "scheduler-status --auth-file PATH（只读持久状态，不启动调度）",
        "文件须为当前用户私有0600常规文件；认证文件只含现有管理员JWT。",
        "使用 npm run --silent exhibition:reminders -- 加上述参数。应用保留原回执，结果未知先核实。",
      ].join("\n"),
    );
  } else {
    if (process.env.APP_ENV !== "local")
      throw new ReminderCommandError("此命令仅限 APP_ENV=local；其他环境不能操作本地提醒。");
    if (process.env.PAYLOAD_DROP_DATABASE === "true")
      throw new ReminderCommandError("本地提醒禁止数据库清理或重置，请先移除重置开关再操作。");
    const options = parseReminderCommand(args);
    const headers = new Headers({
      authorization: "JWT " + readReminderFile(options.authFile, "auth"),
    });
    const receipt =
      options.mode === "apply" || options.mode === "inspect"
        ? readReminderFile(options.receiptFile, "receipt")
        : undefined;
    if (options.mode === "preview") assertNewReminderReceipt(options.receiptFile);
    process.env.HUA_DEMO_SCHEMA_PUSH = "false";
    process.env.DISABLE_PAYLOAD_HMR = "true";
    const { getPayload } = await import("payload");
    const { default: config } = await import("../src/payload.config");
    const service = await import("../src/server/exhibition-reminders");
    const resolved = await config;
    const safety = {
      telemetry: false,
      logger: { options: { level: "silent" } },
      typescript: { ...resolved.typescript, autoGenerate: false },
    } satisfies Pick<Config, "telemetry" | "logger" | "typescript">;
    const db = {
      ...resolved.db,
      init: (args: Parameters<typeof resolved.db.init>[0]) =>
        Object.assign(resolved.db.init(args), { disableCreateDatabase: true, push: false }),
    };
    const localConfig = Object.assign({}, resolved, safety, { db });
    payload = await getPayload({ config: localConfig });
    if (options.mode === "scheduler-resolve") {
      const { withExhibitionScheduler } =
        await import("../src/server/exhibition-reminder-scheduler-control");
      const r = await withExhibitionScheduler(payload, headers, (s) =>
        s.resolve(options.revision, options.reason),
      );
      console.log(
        `已核实结束（未生成或发送邮件）；结果：${r.outcome === "committed" ? "已有提交" : "结束未提交操作"}；状态版本：${r.revision}；范围：${r.scope.key}（${r.scope.locale}）`,
      );
    } else if (options.mode === "inspect") {
      const { inspectExhibitionReminder } =
        await import("../src/server/exhibition-reminder-history");
      const result = await inspectExhibitionReminder(payload, headers, receipt);
      console.log(
        result.state === "committed"
          ? formatReminderReport(result.report, "apply")
          : "未找到可确认提交；当前资格未检查；未生成或取消记录。",
      );
    } else if (options.mode === "scheduler-status") {
      const { readExhibitionSchedulerStatus } =
        await import("../src/server/exhibition-reminder-scheduler-state");
      const r = await readExhibitionSchedulerStatus(payload, headers);
      const label = {
        unregistered: "未登记，调度尚未启用",
        idle: "空闲登记，不代表当前可发",
        running: "已登记运行，进程在线未核实",
        blocked: "存在未决操作，需先核实",
      };
      console.log(
        `本地持久状态（未发送邮件）\n${label[r.status]}；状态版本：${r.revision}${r.scope ? `\n范围：${r.scope.key}（${r.scope.locale}）` : ""}`,
      );
    } else {
      const report =
        options.mode === "preview"
          ? await service.previewExhibitionReminders(payload, headers, {
              key: options.key,
              locale: options.locale,
            })
          : await service.applyExhibitionReminders(payload, headers, receipt);
      if (options.mode === "preview") {
        if (report.blocked) exitCode = 1;
        else if (report.receipt) saveReminderReceipt(options.receiptFile, report.receipt);
        else throw Error("Missing private preview receipt");
      }
      console.log(formatReminderReport(report, options.mode));
    }
  }
} catch (error) {
  exitCode = 1;
  const code = error && typeof error === "object" && "status" in error ? error.status : undefined;
  if (error instanceof ReminderCommandError) console.error(error.message);
  else if (code === 403)
    console.error("管理员登录或权限无效，请通过原登录链路取得有效会话后核实。");
  else if (code === 409)
    console.error(
      "本次操作结果需要核实，请保留原回执并先用原回执查询；没有已提交结果时再重新预检。",
    );
  else
    console.error(
      "本地提醒操作未完成，请核对运行环境、已迁移数据库和管理员凭证；应用时保留原回执以核实结果。",
    );
} finally {
  try {
    await payload?.destroy();
  } catch {
    exitCode = 1;
    console.error("本地提醒数据库连接关闭失败，请核对本地进程并保留原回执。");
  }
}
process.exit(exitCode);
