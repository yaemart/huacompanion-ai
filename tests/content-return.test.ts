import test from "node:test";
import assert from "node:assert/strict";
import { requestContentReturn } from "../src/lib/content-return.ts";

test("cancelling a content return does not submit any workflow mutation", () => {
  const submissions: string[] = [];
  requestContentReturn(
    () => null,
    (note) => submissions.push(note),
  );
  assert.deepEqual(submissions, []);
});

test("confirmed return keeps the supplied note and existing empty-note fallback", () => {
  const submissions: string[] = [];
  requestContentReturn(
    () => "补充核实日期",
    (note) => submissions.push(note),
  );
  requestContentReturn(
    () => "",
    (note) => submissions.push(note),
  );
  assert.deepEqual(submissions, ["补充核实日期", "请修改后重新提交"]);
});
