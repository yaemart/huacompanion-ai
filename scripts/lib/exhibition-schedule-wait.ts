import { performance } from "node:perf_hooks";
import type { ScheduleStop } from "./exhibition-schedule-runner.ts";
import { drainScheduleSignals } from "./exhibition-schedule-stop.ts";

export type ScheduleWaitClock = {
  now: () => number;
  sleep: (ms: number, stop: ScheduleStop) => Promise<void>;
};
const systemClock: ScheduleWaitClock = {
  now: () => performance.now(),
  sleep: async (ms, stop) => {
    await new Promise<void>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined,
        off = () => {},
        done = false;
      const finish = () => {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        off();
        resolve();
      };
      off = stop.onRequest(finish);
      if (done) off();
      else timer = setTimeout(finish, ms);
    });
    await drainScheduleSignals();
  },
};
export async function waitScheduleCycle(
  stop: ScheduleStop,
  checkIdentity: () => Promise<void>,
  clock: ScheduleWaitClock = systemClock,
): Promise<void> {
  const deadline = clock.now() + 60000;
  while (!stop.reason) {
    const remaining = deadline - clock.now();
    if (remaining <= 0) return;
    await clock.sleep(Math.min(5000, remaining), stop);
    if (stop.reason) return;
    await checkIdentity();
  }
}
