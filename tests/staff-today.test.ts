import assert from "node:assert/strict";
import test from "node:test";
import { chinaDay, sortToday, type TodayItem } from "../src/lib/staff-today.ts";

test("today is bounded by Beijing midnight, regardless of host timezone", () => {
  assert.deepEqual(chinaDay(Date.parse("2026-11-13T15:59:59Z")), {
    date: "2026-11-13",
    end: "2026-11-13T16:00:00.000Z",
  });
  assert.equal(chinaDay(Date.parse("2026-11-13T16:00:00Z")).date, "2026-11-14");
});

test("deadline first, then oldest undated task, without modifying the source", () => {
  const make = (id: string, createdAt: string, dueAt?: string): TodayItem => ({
    id,
    createdAt,
    dueAt,
    title: id,
    action: "打开",
    href: "/admin",
  });
  const late = make("late", "2026-11-11", "2026-11-14T10:00:00+08:00");
  const urgent = make("urgent", "2026-11-12", "2026-11-13T23:00:00Z");
  const old = make("old", "2026-11-11");
  const recent = make("recent", "2026-11-12");
  const input = [recent, late, old, urgent];
  assert.deepEqual(sortToday(input), [urgent, late, old, recent]);
  assert.deepEqual(input, [recent, late, old, urgent]);
});
