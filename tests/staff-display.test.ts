import assert from "node:assert/strict";
import { test } from "node:test";
import { staffDate, staffDateTime, staffVersion } from "../src/lib/staff-display.ts";

test("staff timestamps use the Beijing date across midnight and New Year", () => {
  assert.equal(staffDate("2026-11-16T15:59:59.999Z"), "2026-11-16");
  assert.equal(staffDate("2026-11-16T16:00:00.000Z"), "2026-11-17");
  assert.equal(staffDate("2026-12-31T23:55:23Z"), "2027-01-01");
  assert.equal(staffDate("2026-11-17T00:15:00+09:00"), "2026-11-16");
});

test("a calendar date remains a calendar date and unparseable legacy values show a blank mark", () => {
  assert.equal(staffDate("0001-01-01"), "0001-01-01");
  assert.equal(staffDate("2028-02-29"), "2028-02-29");
  assert.equal(staffDate("2026-02-29"), "—");
  assert.equal(staffDate("2026-02-30T12:00:00Z"), "—");
  assert.equal(staffDate("2026-11-17T04:13"), "—");
  assert.equal(staffDate(""), "—");
  assert.equal(staffDate(undefined), "—");
  assert.equal(staffDate(new Date(NaN)), "—");
});

test("time-dependent actions retain Beijing clock time and midnight is 00:00", () => {
  assert.equal(staffDateTime("2026-11-16T16:00:00Z"), "2026-11-17 00:00");
  assert.equal(staffDateTime("2026-11-16T16:00:39Z", true), "2026-11-17 00:00:39");
  assert.equal(staffDateTime("2026-11-17"), "2026-11-17");
  assert.equal(staffDateTime(null), "—");
});

test("draft and published material use one version label with a safe historical fallback", () => {
  assert.equal(staffVersion(3), "第 3 版");
  assert.equal(staffVersion("3"), "第 3 版");
  assert.equal(staffVersion(null), "版本号未记录");
  assert.equal(staffVersion(1.5), "版本号未记录");
});
