import {
  constants,
  closeSync,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { isContentIdentifier } from "../../src/lib/content-identifiers.ts";
import type { previewExhibitionReminders } from "../../src/server/exhibition-reminders.ts";
export class ReminderCommandError extends Error {}
const invalid = () =>
  new ReminderCommandError(
    "参数无效，请使用 preview/apply 和 --auth-file、--receipt-file；预检另需 --key、--locale。不支持发送、日期或强制重试参数。",
  );
export function parseReminderCommand(args: string[]) {
  const [mode, ...rest] = args;
  if (!["preview", "apply"].includes(mode) || rest.length % 2) throw invalid();
  const fields: Record<string, string> = {};
  const allowed =
    mode === "preview"
      ? ["--key", "--locale", "--auth-file", "--receipt-file"]
      : ["--auth-file", "--receipt-file"];
  for (let i = 0; i < rest.length; i += 2) {
    if (
      !allowed.includes(rest[i]) ||
      fields[rest[i]] !== undefined ||
      !rest[i + 1]?.trim() ||
      rest[i + 1].startsWith("--")
    )
      throw invalid();
    fields[rest[i]] = rest[i + 1];
  }
  if (Object.keys(fields).length !== allowed.length) throw invalid();
  const files = { authFile: fields["--auth-file"], receiptFile: fields["--receipt-file"] };
  if (mode === "apply") return { mode: "apply" as const, ...files };
  if (!isContentIdentifier(fields["--key"]) || !["zh", "en"].includes(fields["--locale"]))
    throw invalid();
  return {
    mode: "preview" as const,
    key: fields["--key"],
    locale: fields["--locale"] as "zh" | "en",
    ...files,
  };
}
function valid(value: string, kind: "auth" | "receipt") {
  return (
    value.length <= (kind === "auth" ? 8192 : 2048) &&
    (kind === "auth" ? /^[\w-]+\.[\w-]+\.[\w-]+$/ : /^[\w-]+\.[a-f0-9]{64}$/).test(value)
  );
}
export function readReminderFile(path: string, kind: "auth" | "receipt") {
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = fstatSync(fd),
      max = kind === "auth" ? 8192 : 2048;
    if (
      !stat.isFile() ||
      stat.uid !== process.getuid?.() ||
      (stat.mode & 0o7777) !== 0o600 ||
      stat.nlink !== 1 ||
      stat.size < 1 ||
      stat.size > max + 2
    )
      throw Error();
    const buffer = Buffer.alloc(max + 3),
      length = readSync(fd, buffer, 0, buffer.length, 0);
    const value = buffer.subarray(0, length).toString("utf8").trim();
    if (length !== stat.size || !valid(value, kind)) throw Error();
    closeSync(fd);
    fd = undefined;
    return value;
  } catch {
    throw new ReminderCommandError(
      "认证或回执文件无效：须为当前用户私有0600常规文件，内容为有界原始JWT或预检回执；不接受链接或特殊文件。",
    );
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        /* Preserve the safe input error. */
      }
    }
  }
}
export function assertNewReminderReceipt(path: string) {
  try {
    if (lstatSync(path, { throwIfNoEntry: false }))
      throw new ReminderCommandError(
        "回执目标已存在，请选择新路径；已有回执只能读取核实，不能覆盖。",
      );
    if (!statSync(dirname(path)).isDirectory()) throw Error();
  } catch (error) {
    if (error instanceof ReminderCommandError) throw error;
    throw new ReminderCommandError("回执目标路径不可用，请选择已有目录中的新私有文件。");
  }
}
export function saveReminderReceipt(path: string, receipt: string) {
  let fd: number | undefined;
  try {
    if (!valid(receipt, "receipt")) throw Error();
    fd = openSync(
      path,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    fchmodSync(fd, 0o600);
    writeFileSync(fd, receipt + "\n", "utf8");
    fsyncSync(fd);
  } catch {
    throw new ReminderCommandError(
      "回执文件未能新建或完整保存；不覆盖已有文件，请选择新路径重新预检。",
    );
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
type Report = Awaited<ReturnType<typeof previewExhibitionReminders>>;
export function formatReminderReport(report: Report, mode: "preview" | "apply") {
  const title =
    typeof report.snapshot?.title === "string" ? report.snapshot.title : report.scope.key;
  const safeTitle = Array.from(title.replace(/\p{C}/gu, " ")).slice(0, 160).join("");
  const lines = [
    `本地${mode === "preview" ? "预检" : "核实结果"}（未发送邮件）`,
    `展会：${safeTitle}（${report.scope.locale}）`,
  ];
  const c = report.counts;
  if (report.replayed || report.currentEligibility === "not-checked") {
    lines.push(
      "历史操作结果；当前资格未检查，请另做预检。",
      `当时新增：${c.create}；当时已存在：${c.existing}；当时取消：${c.cancel}`,
      `原操作时间：${report.asOf}`,
    );
  } else {
    lines.push(
      `业务日：${report.today}；档位：${report.offset ? report.offset + "天" : "非生成日，仅可核实失效记录"}`,
    );
    if (report.blocked)
      lines.push("本地生成已被阻止，请核对本地订阅与维护配置；未保存可应用回执。");
    const excluded = Object.values(c.excluded).reduce(
      (n, value) => n + (Number.isSafeInteger(value) && value >= 0 ? value : 0),
      0,
    );
    lines.push(
      `订阅合资格：${c.subscribers}；本档待发：${c.eligible}；取消终态：${c.terminal}`,
      `${mode === "preview" ? "拟新增" : "本次新增"}：${c.create}；已存在：${c.existing}；${mode === "preview" ? "拟取消" : "本次取消"}：${c.cancel}；排除：${excluded}`,
      `截至：${report.asOf}`,
    );
  }
  return lines.join("\n");
}
