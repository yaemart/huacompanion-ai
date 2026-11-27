import type { ScheduleStop } from "./exhibition-schedule-runner";
export async function drainScheduleSignals() {
  await new Promise<void>((resolve) => setImmediate(() => setTimeout(resolve, 0)));
}
export function createScheduleStop(): ScheduleStop & { dispose(): void } {
  const listeners = new Set<() => void>();
  const stop: ScheduleStop & { dispose(): void } = {
    reason: null,
    request(reason) {
      if (this.reason) return;
      this.reason = reason;
      for (const listener of [...listeners]) listener();
      listeners.clear();
    },
    onRequest(listener) {
      if (this.reason) {
        listener();
        return () => {};
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      process.off("SIGINT", int);
      process.off("SIGTERM", term);
      listeners.clear();
    },
  };
  const int = () => stop.request("sigint"),
    term = () => stop.request("sigterm");
  process.on("SIGINT", int);
  process.on("SIGTERM", term);
  return stop;
}
