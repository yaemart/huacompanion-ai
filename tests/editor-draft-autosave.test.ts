import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canAutosaveDraft,
  mergeSavedDraft,
  scheduleDraftAutosave,
  warnBeforeLeavingDraft,
} from "../src/lib/editor-draft-autosave.ts";

test("autosave waits 30 seconds and cancels when the editor is closed or no longer eligible", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const save = t.mock.fn();
  const cancel = scheduleDraftAutosave(save);
  t.mock.timers.tick(29_999);
  assert.equal(save.mock.callCount(), 0);
  t.mock.timers.tick(1);
  assert.equal(save.mock.callCount(), 1);
  scheduleDraftAutosave(save)();
  cancel();
  t.mock.timers.tick(30_000);
  assert.equal(save.mock.callCount(), 1);
});

test("autosave requires an editable dirty draft and waits for active saves or revised input", () => {
  const ready = { editable: true, dirty: true, busy: false, invalid: false };
  assert.equal(canAutosaveDraft(ready), true);
  assert.equal(canAutosaveDraft({ ...ready, editable: false }), false);
  assert.equal(canAutosaveDraft({ ...ready, dirty: false }), false);
  assert.equal(canAutosaveDraft({ ...ready, busy: true }), false);
  assert.equal(canAutosaveDraft({ ...ready, invalid: true }), false);
});

test("unload prompts only for unsaved input or an unacknowledged save", () => {
  const preventDefault = () => {
    prevented = true;
  };
  let prevented = false;
  const event = { preventDefault, returnValue: "" };
  warnBeforeLeavingDraft(event, false);
  assert.equal(prevented, false);
  warnBeforeLeavingDraft(event, true);
  assert.equal(prevented, true);
  assert.equal(event.returnValue, " ");
});

test("a response keeps typing during the request and applies normalized identifiers", () => {
  const sent = { title: "第一版", slug: "", text: "已送出" };
  const saved = { ...sent, slug: "first-draft" };
  assert.equal(mergeSavedDraft(sent, saved, sent), saved);
  assert.deepEqual(mergeSavedDraft(sent, saved, { ...sent, text: "请求期间输入" }), {
    title: "第一版",
    slug: "first-draft",
    text: "请求期间输入",
  });
});
