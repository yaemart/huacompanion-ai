import assert from "node:assert/strict";
import { test } from "node:test";
import { staffKeyboardOverlap } from "../src/lib/staff-mobile-editor.ts";

test("the footer uses the visual viewport bottom when the keyboard overlaps the layout viewport", () => {
  assert.equal(staffKeyboardOverlap(844, { height: 510, offsetTop: 0, scale: 1 }, true), 334);
  assert.equal(staffKeyboardOverlap(844, { height: 510, offsetTop: 128, scale: 1 }, true), 206);
});

test("toolbar motion, pinch zoom and viewport resize without overlap keep the normal footer", () => {
  assert.equal(staffKeyboardOverlap(844, { height: 520, offsetTop: 0, scale: 1 }, false), 0);
  assert.equal(staffKeyboardOverlap(844, { height: 814, offsetTop: 0, scale: 1 }, true), 0);
  assert.equal(staffKeyboardOverlap(844, { height: 420, offsetTop: 40, scale: 2 }, true), 0);
  assert.equal(staffKeyboardOverlap(520, { height: 520, offsetTop: 0, scale: 1 }, true), 0);
  assert.equal(staffKeyboardOverlap(520, undefined, true), 0);
});
