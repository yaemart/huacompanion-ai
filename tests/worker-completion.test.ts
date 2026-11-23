import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("early worker receipt failure preserves cleanup and its original error after polling", () => {
  const helper = new URL("./helpers/worker-completion.ts", import.meta.url).href;
  const script = `
    import assert from 'node:assert/strict';
    import { setTimeout as delay } from 'node:timers/promises';
    import { observeWorkerCompletion } from ${JSON.stringify(helper)};
    const original = new Error('worker receipt guard rejected');
    const receipt = observeWorkerCompletion(Promise.reject(original));
    try {
      await delay(25);
      await assert.rejects(receipt, error => error === original);
    } finally {
      console.log('cleanup executed');
    }
    console.log('original error retained');
  `;
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--unhandled-rejections=strict",
      "--input-type=module",
      "-e",
      script,
    ],
    { encoding: "utf8", timeout: 5000 },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /cleanup executed/);
  assert.match(result.stdout, /original error retained/);
});
