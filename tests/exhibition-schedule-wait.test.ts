import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { createScheduleStop } from "../scripts/lib/exhibition-schedule-stop.ts";
import {
  waitScheduleCycle,
  type ScheduleWaitClock,
} from "../scripts/lib/exhibition-schedule-wait.ts";

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
function controlledClock() {
  let time = 0;
  const delays: number[] = [];
  const tasks = new Set<{ due: number; finish: () => void }>();
  const clock: ScheduleWaitClock = {
    now: () => time,
    sleep: (ms, stop) => {
      delays.push(ms);
      return new Promise<void>((resolve) => {
        let off = () => {};
        const task = {
          due: time + ms,
          finish: () => {
            tasks.delete(task);
            off();
            resolve();
          },
        };
        tasks.add(task);
        off = stop.onRequest(task.finish);
      });
    },
  };
  return {
    clock,
    delays,
    tasks,
    get time() {
      return time;
    },
    advance(ms: number) {
      time += ms;
      for (const task of [...tasks]) if (task.due <= time) task.finish();
    },
    work(ms: number) {
      time += ms;
    },
  };
}

test("next round waits sixty seconds after completion with at most five-second slices", async () => {
  const stop = createScheduleStop(),
    c = controlledClock();
  let checks = 0,
    done = false;
  try {
    c.work(123000);
    const waiting = waitScheduleCycle(
      stop,
      async () => {
        checks++;
      },
      c.clock,
    ).then(() => {
      done = true;
    });
    await flush();
    for (let i = 0; i < 11; i++) {
      c.advance(5000);
      await flush();
    }
    c.advance(4999);
    await flush();
    assert.equal(done, false);
    assert.equal(checks, 11);
    c.advance(1);
    await waiting;
    assert.equal(c.time, 183000);
    assert.equal(checks, 12);
    assert.equal(c.tasks.size, 0);
    assert.deepEqual(c.delays, Array(12).fill(5000));
  } finally {
    stop.dispose();
  }
});

test("identity work consumes the wait without backfilling short ticks", async () => {
  const stop = createScheduleStop(),
    c = controlledClock();
  let checks = 0;
  try {
    const waiting = waitScheduleCycle(
      stop,
      async () => {
        checks++;
        c.work(7000);
      },
      c.clock,
    );
    await flush();
    for (let i = 0; i < 5; i++) {
      c.advance(5000);
      await flush();
    }
    await waiting;
    assert.equal(checks, 5);
    assert.equal(c.time, 60000);
    assert.deepEqual(c.delays, Array(5).fill(5000));
  } finally {
    stop.dispose();
  }
});

test("a long suspended slice performs one fresh check without replaying missed ticks", async () => {
  const stop = createScheduleStop(),
    c = controlledClock();
  let checks = 0;
  try {
    const waiting = waitScheduleCycle(
      stop,
      async () => {
        checks++;
      },
      c.clock,
    );
    await flush();
    c.advance(120000);
    await waiting;
    assert.equal(checks, 1);
    assert.deepEqual(c.delays, [5000]);
  } finally {
    stop.dispose();
  }
});

test("signal wins a due timer and no new identity check begins", async () => {
  const stop = createScheduleStop(),
    c = controlledClock();
  let checks = 0;
  try {
    const waiting = waitScheduleCycle(
      stop,
      async () => {
        checks++;
      },
      c.clock,
    );
    await flush();
    c.advance(5000);
    stop.request("sigterm");
    await waiting;
    assert.equal(checks, 0);
    assert.equal(c.tasks.size, 0);
    assert.equal(stop.reason, "sigterm");
  } finally {
    stop.dispose();
  }
});

test("already requested stop starts no sleep or identity work", async () => {
  const stop = createScheduleStop(),
    c = controlledClock();
  stop.request("sigint");
  try {
    await waitScheduleCycle(
      stop,
      async () => {
        assert.fail("no check after stop");
      },
      c.clock,
    );
    assert.deepEqual(c.delays, []);
  } finally {
    stop.dispose();
  }
});

test("identity failure propagates and does not schedule another slice", async () => {
  const stop = createScheduleStop(),
    c = controlledClock(),
    error = Error("native session rejected");
  try {
    const waiting = waitScheduleCycle(
      stop,
      async () => {
        throw error;
      },
      c.clock,
    );
    const rejected = assert.rejects(waiting, (e) => e === error);
    await flush();
    c.advance(5000);
    await rejected;
    assert.deepEqual(c.delays, [5000]);
    assert.equal(c.tasks.size, 0);
    assert.equal(stop.reason, null);
  } finally {
    stop.dispose();
  }
});

test("an in-flight identity rejection takes precedence over a later stop", async () => {
  const stop = createScheduleStop(),
    c = controlledClock(),
    error = Error("revoked");
  let rejectCheck!: (e: Error) => void;
  try {
    const waiting = waitScheduleCycle(
      stop,
      () =>
        new Promise<void>((_, reject) => {
          rejectCheck = reject;
        }),
      c.clock,
    );
    const rejected = assert.rejects(waiting, (e) => e === error);
    await flush();
    c.advance(5000);
    await flush();
    stop.request("sigint");
    rejectCheck(error);
    await rejected;
    assert.equal(c.tasks.size, 0);
  } finally {
    stop.dispose();
  }
});

test("stop subscriptions are removable, first-reason-only and immediately observe a late request", () => {
  const stop = createScheduleStop();
  let first = 0,
    removed = 0,
    late = 0;
  const off = stop.onRequest(() => {
    removed++;
  });
  off();
  stop.onRequest(() => {
    first++;
  });
  stop.request("sigint");
  stop.request("sigterm");
  stop.onRequest(() => {
    late++;
  })();
  assert.deepEqual(
    { first, removed, late, reason: stop.reason },
    { first: 1, removed: 0, late: 1, reason: "sigint" },
  );
  stop.dispose();
});

test("dispose removes subscriptions without manufacturing a stop signal", () => {
  const stop = createScheduleStop();
  let called = 0;
  stop.onRequest(() => {
    called++;
  });
  stop.dispose();
  assert.equal(stop.reason, null);
  stop.request("sigterm");
  assert.equal(called, 0);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  test("real default wait cleans its timer and process listeners after " + signal, () => {
    const child = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "--input-type=module",
        "-e",
        `
      import assert from 'node:assert/strict';
      import {createScheduleStop} from './scripts/lib/exhibition-schedule-stop.ts';
      import {waitScheduleCycle} from './scripts/lib/exhibition-schedule-wait.ts';
      const before=process.listenerCount('${signal}'), stop=createScheduleStop();
      const waiting=waitScheduleCycle(stop,async()=>{assert.fail('no new check after signal')});
      setTimeout(()=>{process.kill(process.pid,'${signal}');process.kill(process.pid,'${signal}');},25);
      await waiting;
      assert.equal(stop.reason,'${signal === "SIGINT" ? "sigint" : "sigterm"}');
      stop.dispose();
      assert.equal(process.listenerCount('${signal}'),before);
      console.log('natural exit after cancelled real wait');
    `,
      ],
      { encoding: "utf8", timeout: 3000 },
    );
    assert.equal(child.status, 0, child.stderr || String(child.error));
    assert.equal(child.signal, null);
    assert.match(child.stdout, /natural exit after cancelled real wait/);
  });
}
