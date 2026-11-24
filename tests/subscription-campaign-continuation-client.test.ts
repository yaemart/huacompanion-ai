import assert from "node:assert/strict";
import { test } from "node:test";
import {
  continuationRequest,
  parseContinuationReceipt,
} from "../src/lib/subscription-campaign-continuation-client.ts";
import { MockTaskRequestError } from "../src/lib/subscription-campaign-task-client.ts";

const draft = { campaignKey: "00000000-0000-4000-8000-000000000000", revision: 2 };
const receipt = {
  ...draft,
  originalRevision: 1,
  bound: 3,
  continuedAt: "2030-01-01T00:00:00.000Z",
  replayed: false,
};
test("continuation submits explicit confirmation and recovery reads without resubmitting", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const calls: unknown[] = [];
  globalThis.fetch = async (_url, init) => {
    calls.push(JSON.parse(String(init?.body)));
    return Response.json({ continuation: receipt });
  };
  assert.deepEqual(await continuationRequest(draft), receipt);
  assert.deepEqual(await continuationRequest(draft, true), receipt);
  assert.deepEqual(calls, [
    { action: "continue-revision-local", input: { ...draft, confirmed: true } },
    { action: "read-continuation-local", input: draft },
  ]);
});
test("only a successful readonly response may contain no persisted receipt", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async () => Response.json({ continuation: null });
  assert.equal(await continuationRequest(draft, true), null);
  await assert.rejects(
    continuationRequest(draft),
    (error) => error instanceof MockTaskRequestError && error.uncertain,
  );
});
for (const [label, patch] of Object.entries({
  crossCampaign: { campaignKey: "elsewhere" },
  crossRevision: { revision: 3 },
  notRevised: { originalRevision: 2 },
  invalidOriginal: { originalRevision: 0 },
  fractionalOriginal: { originalRevision: 1.1 },
  zeroBound: { bound: 0 },
  overflow: { bound: 1001 },
  fraction: { bound: 1.5 },
  stringCount: { bound: "3" },
  invalidDate: { continuedAt: "wrong" },
  nonCanonical: { continuedAt: "2030-01-01T00:00:00Z" },
  invalidReplay: { replayed: "true" },
  privateEmail: { email: "secret@example.invalid" },
  privateJobs: { jobs: [1] },
  privateConfirmation: { confirmationId: 1 },
}))
  test("receipt rejects " + label, () => {
    assert.throws(() => parseContinuationReceipt({ ...receipt, ...patch }, draft));
  });
for (const bad of [null, [], false, "receipt", {}, { ...receipt, bound: undefined }])
  test("receipt rejects malformed " + JSON.stringify(bad), () => {
    assert.throws(() => parseContinuationReceipt(bad, draft));
  });
for (const status of [400, 403, 404, 409, 503])
  test("continuation classifies HTTP " + status, async (t) => {
    const original = globalThis.fetch;
    t.after(() => {
      globalThis.fetch = original;
    });
    globalThis.fetch = async () => Response.json({ error: "虚构拒绝" }, { status });
    await assert.rejects(
      continuationRequest(draft),
      (error) => error instanceof MockTaskRequestError && error.uncertain === status >= 500,
    );
  });
for (const mode of ["network", "invalid-json", "missing", "array", "extra"])
  test("unknown result remains uncertain: " + mode, async (t) => {
    const original = globalThis.fetch;
    t.after(() => {
      globalThis.fetch = original;
    });
    globalThis.fetch = async () => {
      if (mode === "network") throw TypeError("offline");
      if (mode === "invalid-json") return new Response("invalid", { status: 503 });
      return Response.json(
        mode === "missing"
          ? {}
          : mode === "array"
            ? []
            : { continuation: receipt, email: "private" },
      );
    };
    await assert.rejects(
      continuationRequest(draft),
      (error) => error instanceof MockTaskRequestError && error.uncertain,
    );
  });
