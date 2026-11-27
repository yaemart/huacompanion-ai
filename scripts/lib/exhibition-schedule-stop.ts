import type { ScheduleStop } from "./exhibition-schedule-runner";
export async function drainScheduleSignals() {
  await new Promise<void>((resolve) => setImmediate(() => setTimeout(resolve, 0)));
}
export function createScheduleStop(): ScheduleStop & { dispose(): void } {
  const stop: ScheduleStop & { dispose(): void } = {
    reason: null,
    request(reason) {
      this.reason ||= reason;
    },
    dispose() {
      process.off("SIGINT", int);
      process.off("SIGTERM", term);
    },
  };
  const int = () => stop.request("sigint"),
    term = () => stop.request("sigterm");
  process.on("SIGINT", int);
  process.on("SIGTERM", term);
  return stop;
}
