import assert from "node:assert/strict";
import test from "node:test";
import { followupEventDetails } from "../src/lib/crm-followup-events.ts";
test("staff followup event details expose only safe action fields and state", () => {
  assert.deepEqual(
    followupEventDetails({
      body: "Real result",
      reason: "Correction",
      source: "legacy-import",
      originalActorKnown: false,
      inputDigest: "private-digest",
      originalRecord: { email: "secret@example.invalid" },
      before: {
        revision: 1,
        state: "pending",
        dueAt: "2026-11-28T00:00:00.000Z",
        assigneeID: 3,
        needsReview: true,
        password: "hidden",
      },
      continuationTaskID: 8,
    }),
    {
      body: "Real result",
      reason: "Correction",
      source: "legacy-import",
      originalActorKnown: false,
      before: {
        revision: 1,
        state: "pending",
        dueAt: "2026-11-28T00:00:00.000Z",
        assigneeID: 3,
        needsReview: true,
      },
      continuationTaskID: 8,
    },
  );
  assert.deepEqual(
    followupEventDetails({
      body: { private: true },
      before: { private: true },
      sourceDigest: "private",
    }),
    {},
  );
});
