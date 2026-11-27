import { createHash } from "node:crypto";
import type { Payload } from "payload";
import type { ReminderReport } from "../../src/server/exhibition-reminders";
import { createScheduleDirectory, type RunDirectory } from "./exhibition-schedule-directory";
import type { ScheduleManifest } from "./exhibition-schedule-input";

export type ScheduleStop = {
  reason: null | "sigint" | "sigterm";
  request(reason: "sigint" | "sigterm"): void;
};
export type ScheduleReport = { mode: "preview" | "apply"; report: ReminderReport };
export async function runScheduleOnce(
  p: Payload,
  headers: Headers,
  manifest: ScheduleManifest,
  stateDir: string,
  stop: ScheduleStop,
  onReport: (r: ScheduleReport) => void,
): Promise<{ exitCode: 0 | 130 | 143 }> {
  const halted = async () => {
    await new Promise<void>((resolve) => setImmediate(resolve));
    return stop.reason !== null;
  };
  const result = () => ({
    exitCode:
      stop.reason === "sigint"
        ? (130 as const)
        : stop.reason === "sigterm"
          ? (143 as const)
          : (0 as const),
  });
  if (await halted()) return result();
  const { withExhibitionScheduler } =
    await import("../../src/server/exhibition-reminder-scheduler-control");
  const { authenticateReminderAdmin } =
    await import("../../src/server/exhibition-reminder-authority");
  const { readExhibitionSchedulerStatus } =
    await import("../../src/server/exhibition-reminder-scheduler-state");
  const { previewExhibitionReminders } = await import("../../src/server/exhibition-reminders");
  const { ContentError } = await import("../../src/server/content/error");
  return withExhibitionScheduler(p, headers, async (session) => {
    if ((await readExhibitionSchedulerStatus(p, headers)).status === "blocked")
      throw new ContentError("存在未决操作，请先独立核实结束。", 409);
    const user = await authenticateReminderAdmin(p, headers);
    if (await halted()) return result();
    const { rows } = await p.db.pool.query(
      "SELECT current_database() AS name, inet_server_addr()::text AS address, inet_server_port() AS port",
    );
    const binding = createHash("sha256")
      .update(JSON.stringify([1, rows[0].name, rows[0].address, rows[0].port]))
      .digest("hex");
    if (await halted()) return result();
    let directory: RunDirectory | undefined;
    try {
      directory = createScheduleDirectory(stateDir, manifest, binding);
      if (await halted()) return result();
      const { runId, revision } = await session.begin(manifest.targets.map((t) => ({ ...t })));
      try {
        directory.started({ runId, revision, owner: user.id });
      } catch (error) {
        try {
          await session.stop(runId);
        } catch {
          /* Never retry unknown cleanup. */
        }
        throw error;
      }
      let pending = false;
      for (const scope of manifest.targets) {
        if (await halted()) break;
        await authenticateReminderAdmin(p, headers);
        if (await halted()) break;
        const preview = await previewExhibitionReminders(p, headers, scope);
        onReport({ mode: "preview", report: preview });
        if (preview.blocked) throw new ContentError("本地生成门禁未通过。", 409);
        if (await halted()) break;
        if (!preview.counts.create && !preview.counts.cancel) continue;
        if (!preview.receipt) throw Error("Missing receipt");
        const operation = directory.plan(scope, preview.receipt);
        await authenticateReminderAdmin(p, headers);
        if (await halted()) break;
        pending = true;
        const prepared = await session.prepare(runId, preview.receipt);
        operation.prepared(prepared.revision);
        if (await halted()) break;
        await authenticateReminderAdmin(p, headers);
        if (await halted()) break;
        operation.applying();
        if (await halted()) break;
        const report = await session.apply(runId, preview.receipt);
        await authenticateReminderAdmin(p, headers);
        const finished = await session.finish(runId, preview.receipt);
        pending = false;
        operation.finished(finished.revision, report.asOf);
        onReport({ mode: "apply", report });
      }
      if (!pending) {
        await session.stop(runId);
        directory.stopped();
      }
      return result();
    } finally {
      directory?.close();
    }
  });
}
