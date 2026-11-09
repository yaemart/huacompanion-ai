import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { followUps, followupInput, followupText } from "../src/lib/intake-followups.ts";

test("follow-up command accepts only source/id/body/key; metadata is server-owned", () => {
  const key = randomUUID();
  assert.deepEqual(followupInput({ kind: "inquiries", id: 2, body: " 新跟进 ", key }), {
    kind: "inquiries",
    id: 2,
    body: "新跟进",
    key,
  });
  for (const input of [
    null,
    [],
    {},
    { kind: "staff", id: 2, body: "ok", key },
    { kind: "providers", id: -1, body: "ok", key },
    { kind: "providers", id: 2, body: " ", key },
    { kind: "providers", id: 2, body: "x".repeat(10001), key },
    { kind: "providers", id: 2, body: "ok", key: "bad" },
    { kind: "providers", id: 2, body: "ok", key, actor: "fake" },
    { kind: "providers", id: 2, body: "ok", key, at: "2000-01-01" },
  ])
    assert.throws(() => followupInput(input));
});
test("history preserves old text, unknown metadata, Chinese time and explicit unknown legacy author/date", () => {
  const rows = [
    { id: "legacy", body: "  旧备注\n原文  ", legacy: true, imported: "preserve" },
    {
      id: randomUUID(),
      body: "新跟进",
      actor: "5",
      actorName: "运营甲",
      at: "2026-11-09T16:01:00.000Z",
      key: randomUUID(),
    },
  ];
  assert.deepEqual(followUps(rows), rows);
  const text = followupText(rows, "fallback");
  assert.ok(text.includes("旧备注（原时间／记录人未记录）\n  旧备注\n原文  "));
  assert.ok(text.includes("2026-11-10 00:01（北京时间） · 运营甲\n新跟进"));
  assert.equal(followupText(null, "旧原文"), "旧原文");
  assert.deepEqual(followUps(undefined), []);
  for (const corrupt of [{}, [null], [{ body: "missing id" }]])
    assert.throws(() => followUps(corrupt));
});
test("boolean ids and malformed stored metadata are refused without replacing history", () => {
  for (const id of [true, [1], {}, "1.0"])
    assert.throws(() => followupInput({ kind: "inquiries", id, body: "测试", key: randomUUID() }));
  assert.throws(() => followUps([{ id: "broken", body: "原文", at: "bad" }]));
});
