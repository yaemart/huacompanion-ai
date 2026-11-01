import assert from "node:assert/strict";
import {
  summarizeOperations,
  conversationTimings,
  submitSatisfaction,
  addSupportReview,
  operationsReport,
  retentionAction,
} from "../../src/server/support/operations";
// In-memory fixture only: this suite never connects to a database or external service.
const now = Date.now(),
  old = new Date(now - 500 * 86400000).toISOString();
const admin = { id: 1, role: "admin", collection: "staff", active: true },
  operator = { id: 2, role: "operations", collection: "staff", team: 1 };
const data: Record<string, any[]> = {
  "support-conversations": [
    {
      id: 1,
      visitorHash: "owner",
      status: "resolved",
      mode: "human",
      createdAt: old,
      updatedAt: old,
      inquiryLinks: [],
    },
    {
      id: 2,
      visitorHash: "other",
      status: "resolved",
      mode: "human",
      createdAt: old,
      updatedAt: old,
      inquiryLinks: [{ reference: "active" }],
    },
    { id: 3, status: "resolved", mode: "human", createdAt: old, updatedAt: old, inquiryLinks: [] },
  ],
  "support-messages": [{ id: 1, conversation: 1, text: "private old text" }],
  "support-runs": [],
  "support-feedback": [],
  "support-reviews": [],
  "support-retention-audits": [],
  "support-voice-jobs": [],
  "support-voice-audio": [],
  "support-calls": [{ id: 1, conversation: 3, state: "active" }],
  inquiries: [{ id: 1, reference: "active", status: "new" }],
};
function match(row: any, w: any): boolean {
  if (!w) return true;
  return Object.entries(w).every(([k, v]: [string, any]) =>
    k === "and"
      ? v.every((x: any) => match(row, x))
      : k === "or"
        ? v.some((x: any) => match(row, x))
        : Object.entries(v).every(([op, val]: [string, any]) =>
            op === "equals"
              ? row[k] === val
              : op === "in"
                ? val.includes(row[k])
                : op === "less_than"
                  ? row[k] < val
                  : op === "exists"
                    ? !!row[k] === val
                    : true,
          ),
  );
}
const settings: any = {
  textRetentionDays: 365,
  audioRetentionDays: 30,
  transcriptRetentionDays: 365,
  retentionDeletionEnabled: false,
};
const p: any = {
  db: {
    beginTransaction: async () => 1,
    commitTransaction: async () => {},
    rollbackTransaction: async () => {},
    sessions: { 1: { db: { execute: async () => {} } } },
    updateOne: async (o: any) => {
      const doc = data[o.collection].find((r) => r.id === o.id);
      Object.assign(doc, o.data);
      return doc;
    },
  },
  findGlobal: async () => settings,
  find: async (o: any) => {
    let docs = data[o.collection].filter((r) => match(r, o.where));
    if (o.collection === "support-conversations" && o.overrideAccess === false && o.user.id === 2)
      docs = docs.filter((r) => r.id === 1);
    return { docs, totalDocs: docs.length, hasNextPage: false };
  },
  findByID: async (o: any) => {
    const doc = data[o.collection].find((r) => r.id === o.id);
    if (!doc || (o.overrideAccess === false && o.user.id === 2 && o.id !== 1))
      throw Error("Forbidden");
    return doc;
  },
  count: async (o: any) => ({
    totalDocs: data[o.collection].filter((r) => match(r, o.where)).length,
  }),
  create: async (o: any) => {
    const doc = { id: data[o.collection].length + 1, ...o.data };
    data[o.collection].push(doc);
    return doc;
  },
  update: async (o: any) => {
    const docs = data[o.collection].filter((r) => (o.id ? r.id === o.id : match(r, o.where)));
    docs.forEach((r) => Object.assign(r, o.data, { updatedAt: new Date().toISOString() }));
    return docs[0];
  },
  delete: async (o: any) => {
    data[o.collection] = data[o.collection].filter((r) => r.id !== o.id);
  },
};
await assert.rejects(() => submitSatisfaction(p, "other", { id: 1, rating: 5 }));
await submitSatisfaction(p, "owner", { id: 1, rating: 5, comment: "good" });
await submitSatisfaction(p, "owner", { id: 1, rating: 5, comment: "good" });
assert.equal(data["support-feedback"].length, 1);
await assert.rejects(() => submitSatisfaction(p, "owner", { id: 1, rating: 1 }));
await assert.rejects(() =>
  addSupportReview(p, operator, {
    id: 2,
    key: "abcdefghijklmnop",
    category: "knowledge-gap",
    note: "wrong scope",
  }),
);
await addSupportReview(p, operator, {
  id: 1,
  key: "abcdefghijklmnop",
  category: "knowledge-gap",
  note: "missing instructions",
});
await addSupportReview(p, operator, {
  id: 1,
  key: "abcdefghijklmnop",
  category: "knowledge-gap",
  note: "missing instructions",
});
assert.equal(data["support-reviews"].length, 1);
const report = await operationsReport(p, operator);
assert.equal(report.metrics.conversations, 1);
assert.equal(report.retention, undefined);
assert.equal(report.metrics.calls.total, 0);
const metrics = summarizeOperations(
  [{ status: "open", mode: "waiting", nextFollowUp: old }],
  [
    {
      status: "succeeded",
      reserved: 100,
      usage: { inputTokens: 2, outputTokens: 3 },
      createdAt: old,
      updatedAt: new Date(Date.parse(old) + 50).toISOString(),
    },
    { status: "failed", reserved: 200, createdAt: old, updatedAt: old },
  ],
  [],
  [],
  now,
);
assert.equal(metrics.waiting, 1);
assert.equal(metrics.overdue, 1);
assert.equal(metrics.ai.reportedTokens, 5);
assert.equal(metrics.ai.reservedTokens, 300);
assert.equal(metrics.ai.usageUnknown, 1);
assert.equal(metrics.ai.averageQueueToCompletionMs, 25);
await assert.rejects(() => retentionAction(p, operator, { action: "preview", kind: "text" }));
const preview = await retentionAction(p, admin, { action: "preview", kind: "text" });
assert.deepEqual(preview.ids, [1]);
assert.equal(data["support-messages"][0].text, "private old text");
await assert.rejects(() =>
  retentionAction(p, admin, {
    action: "execute",
    kind: "text",
    token: preview.token,
    confirm: "DELETE SUPPORT CONTENT",
  }),
);
settings.retentionDeletionEnabled = true;
await assert.rejects(() =>
  retentionAction(p, admin, {
    action: "execute",
    kind: "text",
    token: preview.token,
    confirm: true,
  }),
);
await retentionAction(p, admin, {
  action: "execute",
  kind: "text",
  token: preview.token,
  confirm: "DELETE SUPPORT CONTENT",
});
assert.equal(data["support-messages"][0].text, "[Content removed by retention policy]");
assert.equal(data.inquiries.length, 1);
assert.equal(data["support-conversations"].length, 3);
assert.equal(
  data["support-conversations"][0].updatedAt,
  old,
  "text cleanup must preserve activity time for audio/transcript retention",
);
assert.equal(data["support-retention-audits"][0].status, "executed");
// Revalidation excludes a conversation reopened after its preview.
const race = await retentionAction(p, admin, { action: "preview", kind: "text" });
data["support-conversations"][0].status = "open";
const skipped = await retentionAction(p, admin, {
  action: "execute",
  kind: "text",
  token: race.token,
  confirm: "DELETE SUPPORT CONTENT",
});
assert.equal(skipped.processed, 0);
data["support-conversations"][0].status = "resolved";
data["support-voice-audio"].push({ id: 1, conversation: 1, body: "fictional", createdAt: old });
data["support-messages"][0].voiceAudio = 1;
data["support-messages"][0].voiceTranscript = "retained transcript";
data["support-messages"][0].createdAt = old;
data["support-voice-jobs"].push({ id: 1, conversation: 1, status: "succeeded", audio: 1 });
const audio = await retentionAction(p, admin, { action: "preview", kind: "audio" });
assert.deepEqual(audio.ids, [1]);
await retentionAction(p, admin, {
  action: "execute",
  kind: "audio",
  token: audio.token,
  confirm: "DELETE SUPPORT CONTENT",
});
assert.equal(data["support-voice-audio"].length, 0);
assert.equal(data["support-messages"][0].voiceAudio, null);
assert.equal(data["support-voice-jobs"][0].audio, null);
assert.equal(data["support-messages"][0].voiceTranscript, "retained transcript");
const transcript = await retentionAction(p, admin, { action: "preview", kind: "transcript" });
await retentionAction(p, admin, {
  action: "execute",
  kind: "transcript",
  token: transcript.token,
  confirm: "DELETE SUPPORT CONTENT",
});
assert.equal(data["support-messages"][0].voiceTranscript, null);
const time = (seconds: number) => new Date(seconds * 1000).toISOString();
const timing = conversationTimings(
  [
    { id: 11, status: "resolved", updatedAt: time(999) },
    { id: 12, status: "open" },
    { id: 13, status: "resolved" },
  ],
  [
    { id: 1, conversation: 11, author: "system", visibility: "public", createdAt: time(0) },
    { id: 2, conversation: 11, author: "customer", visibility: "public", createdAt: time(10) },
    { id: 3, conversation: 11, author: "staff", visibility: "internal", createdAt: time(11) },
    { id: 4, conversation: 11, author: "system", visibility: "public", createdAt: time(12) },
    { id: 5, conversation: 11, author: "ai", visibility: "public", createdAt: time(15) },
    {
      id: 6,
      conversation: 11,
      author: "system",
      visibility: "internal",
      text: '{"action":"resolve"}',
      createdAt: time(20),
    },
    {
      id: 7,
      conversation: 11,
      author: "system",
      visibility: "internal",
      text: '{"action":"resolve"}',
      createdAt: time(30),
    },
    { id: 8, conversation: 12, author: "customer", visibility: "public", createdAt: time(1) },
    { id: 9, conversation: 13, author: "customer", visibility: "public", createdAt: time(1) },
    { id: 10, conversation: 999, author: "staff", visibility: "public", createdAt: time(11) },
  ],
);
assert.equal(timing.averageFirstResponseMs, 5000);
assert.equal(timing.firstResponseSamples, 1);
assert.equal(timing.averageResolutionMs, 20000);
assert.equal(timing.resolutionSamples, 1);
assert.equal(timing.unansweredConversations, 2);
assert.equal(timing.resolvedWithoutTimestamp, 1);
data["support-messages"].push({
  id: 2,
  conversation: 1,
  dedupe: "call-summary:42",
  author: "system",
  visibility: "internal",
  text: "automatic combined summary/transcript",
  createdAt: old,
});
const callTranscript = await retentionAction(p, admin, { action: "preview", kind: "transcript" });
assert.deepEqual(callTranscript.ids, [2]);
await retentionAction(p, admin, {
  action: "execute",
  kind: "transcript",
  token: callTranscript.token,
  confirm: "DELETE SUPPORT CONTENT",
});
assert.equal(data["support-messages"][1].text, "[Content removed by retention policy]");
console.log(
  "PASS support operations scope, feedback ownership/dedupe, usage, review, retention preview/disable/confirm/active case/active call/audit",
);
