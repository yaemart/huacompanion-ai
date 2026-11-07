import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { queryImmigrationPolicies } from "../src/lib/immigration-policy-query.ts";
import { policyQueryCopy } from "../src/lib/immigration-policy-query-copy.ts";
import { queryContext, queryPolicy } from "./helpers/policy-query-fixture.ts";

const run = (
  arrivalDate: unknown,
  policies: readonly unknown[] = [queryPolicy()],
  nationalityISO: unknown = "XY",
) => queryImmigrationPolicies({ nationalityISO, arrivalDate }, policies, queryContext);

test("query includes start and cutoff dates but never guesses an extension", () => {
  for (const date of ["2026-12-30", "2026-12-31", "2026-01-01"]) {
    assert.equal(run(date).status, "matched", date);
  }
  for (const date of ["2025-12-31", "2027-01-01"]) {
    const result = run(date);
    assert.equal(result.status, "unconfirmed", date);
    assert.deepEqual(result.matches, []);
    assert.match(result.notice.zh, /该日期的政策尚未确认/);
    assert.deepEqual(result.visaGuide, queryContext.visaGuide);
    assert.doesNotMatch(JSON.stringify(result), /必须办签证|已延期/);
  }
});

test("missing expiry is open in the dataset, with a warning rather than a permanence claim", () => {
  for (const validUntil of [null, undefined]) {
    const policy = queryPolicy({ validUntil });
    assert.equal(run("2025-12-31", [policy]).status, "unconfirmed");
    const result = run("2035-01-01", [policy]);
    assert.equal(result.status, "matched");
    assert.equal(result.matches[0].validUntil, null);
    assert.deepEqual(result.matches[0].warnings, ["conditions-unchecked", "expiry-not-stated"]);
  }
  assert.match(policyQueryCopy.warnings["expiry-not-stated"].zh, /不代表永久/);
});

test("expired and valid policies coexist, while gaps and all-future records stay unconfirmed", () => {
  const expired = queryPolicy({ validUntil: "2026-06-30" });
  const future = queryPolicy({ validFrom: "2026-08-01", maxStayDays: 7 });
  assert.equal(run("2026-07-15", [expired, future]).status, "unconfirmed");
  assert.equal(run("2025-12-31", [future]).status, "unconfirmed");
  const result = run("2026-08-01", [expired, future]);
  assert.equal(result.matches.length, 1);
  assert.deepEqual(result.matches[0].stay, { unit: "days", maximum: 7 });
});

test("unlisted nationalities and the explicit not-listed option return unconfirmed", () => {
  for (const code of ["ZZ", null])
    assert.equal(run("2026-06-01", undefined, code).status, "unconfirmed");
  assert.equal(run("2026-06-01", undefined, " xy ").status, "matched");
  assert.equal(run("2026-06-01", []).status, "unconfirmed");
});

test("invalid fields are rejected without echoing visitor input", () => {
  for (const code of [undefined, 123, {}, "", "X", "XYZ", "中文", "X1", "ſX", "ıY"]) {
    const result = queryImmigrationPolicies(
      { nationalityISO: code, arrivalDate: "2026-01-01" },
      [queryPolicy()],
      queryContext,
    );
    assert.equal(result.status, "invalid-input");
    assert.deepEqual(result.errors, ["nationalityISO"]);
    assert.deepEqual(result.matches, []);
  }
  for (const date of [
    undefined,
    null,
    20260101,
    {},
    "",
    "2026-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-00-01",
    "2026-01-00",
    " 2026-01-01",
    "2026-01-01T00:00:00Z",
  ]) {
    assert.deepEqual(run(date).errors, ["arrivalDate"]);
  }
  const result = run("private input should not appear", undefined, "also private");
  assert.deepEqual(result.errors, ["nationalityISO", "arrivalDate"]);
  assert.doesNotMatch(JSON.stringify(result), /private input|also private/);
  assert.equal(run("2024-02-29", [queryPolicy({ validFrom: "2024-01-01" })]).status, "matched");
});

test("all applicable policies keep separate durations and sources; general policies precede transit", () => {
  const types = ["transit-240h", "other", "bilateral", "unilateral"] as const;
  const policies = types.map((policyType, index) =>
    queryPolicy({
      policyType,
      maxStayDays: index + 2,
      officialSourceUrl: `https://example.invalid/source-${index}`,
    }),
  );
  const result = run("2026-06-01", policies);
  assert.deepEqual(
    result.matches.map((row) => row.policyType),
    ["unilateral", "bilateral", "other", "transit-240h"],
  );
  assert.deepEqual(
    result.matches.map((row) => row.stay),
    [
      { unit: "days", maximum: 5 },
      { unit: "days", maximum: 4 },
      { unit: "days", maximum: 3 },
      { unit: "hours", maximum: 240 },
    ],
  );
  assert.deepEqual(
    result.matches.map((row) => row.officialSourceUrl),
    [3, 2, 1, 0].map((n) => `https://example.invalid/source-${n}`),
  );
  assert.ok(result.matches.every((row) => row.lastVerifiedOn === "2026-01-01"));
  assert.ok(result.matches.every((row) => row.warnings.includes("conditions-unchecked")));
  assert.equal("maximum" in result, false);
});

test("240-hour transit keeps itinerary warnings and never infers a departure date or calendar days", () => {
  const result = run("2026-06-01", [queryPolicy({ policyType: "transit-240h", validUntil: null })]);
  const row = result.matches[0];
  assert.deepEqual(row.stay, { unit: "hours", maximum: 240 });
  assert.deepEqual(row.portsAndRegions, ["Fictional port condition"]);
  assert.equal(row.publicNotes, "Fictional purpose and passport conditions");
  assert.deepEqual(row.warnings, [
    "conditions-unchecked",
    "expiry-not-stated",
    "transit-itinerary-unchecked",
  ]);
  assert.equal("maxStayDays" in row, false);
  assert.doesNotMatch(JSON.stringify(result), /departure|2026-06-11/);
});

test("same-type order is deterministic, latest verification first and ties independent of array order", () => {
  const policies = [
    queryPolicy({ officialSourceUrl: "https://example.invalid/b" }),
    queryPolicy({ lastVerifiedOn: "2026-10-01" }),
    queryPolicy({ officialSourceUrl: "https://example.invalid/a" }),
  ];
  const result = run("2026-06-01", policies);
  assert.deepEqual(result, run("2026-06-01", [...policies].reverse()));
  assert.deepEqual(
    result.matches.map((row) => row.officialSourceUrl),
    ["https://example.invalid/policy", "https://example.invalid/a", "https://example.invalid/b"],
  );
  assert.equal(run("2026-06-01", [policies[0], policies[0]]).matches.length, 2);
});

test("corrupt records and mistaken private/workflow records fail closed", () => {
  const privateKeys = {
    id: 12,
    status: "draft",
    active: false,
    reviewState: "published",
    revision: 5,
    policyRef: { id: 12 },
    verifiedBy: 99,
    internalNotes: "secret",
    email: "secret@example.invalid",
    toString: "private",
  };
  for (const [key, value] of Object.entries(privateKeys)) {
    assert.equal(
      run("2026-06-01", [{ ...queryPolicy(), [key]: value }]).status,
      "unconfirmed",
      key,
    );
  }
  for (const row of [
    null,
    [],
    "private",
    queryPolicy({ lastVerifiedOn: "2027-01-01" }),
    queryPolicy({ maxStayDays: 0 }),
    queryPolicy({ officialSourceUrl: "javascript:alert(1)" }),
    queryPolicy({ policyType: "transit-240h", portsAndRegions: [] }),
  ]) {
    assert.equal(run("2026-06-01", [row]).status, "unconfirmed");
  }
  const result = run("2026-06-01", [{ ...queryPolicy(), internalNotes: "secret" }, queryPolicy()]);
  assert.equal(result.matches.length, 1);
  assert.doesNotMatch(JSON.stringify(result), /internalNotes|verifiedBy|secret/);
});

test("the result is detached from frozen policy inputs, guide and shared copy", () => {
  const policy = queryPolicy();
  Object.freeze(policy.portsAndRegions);
  Object.freeze(policy);
  const result = run("2026-06-01", Object.freeze([policy]));
  result.matches[0].portsAndRegions.push("Caller change");
  result.matches[0].stay.maximum = 99;
  result.matches[0].warnings.length = 0;
  result.notice.zh = "Caller change";
  if (result.visaGuide) result.visaGuide.title = "Caller change";
  const again = run("2026-06-01", [policy]);
  assert.deepEqual(again.matches[0].portsAndRegions, ["Fictional port condition"]);
  assert.deepEqual(again.matches[0].stay, { unit: "days", maximum: 3 });
  assert.deepEqual(again.matches[0].warnings, ["conditions-unchecked"]);
  assert.notEqual(again.notice.zh, "Caller change");
  assert.equal(again.visaGuide?.title, "Fictional visa guide");
});

test("guide is an optional safe internal reference, not a fabricated fallback", () => {
  for (const visaGuide of [
    null,
    { href: "https://example.invalid/visa", title: "External" },
    { href: "javascript:alert(1)", title: "Bad" },
    { href: "/fr/guides/visa", title: "Bad" },
    { href: "/en/guides/visa?private=1", title: "Bad" },
    { href: "/en/guides/visa#part", title: "Bad" },
    { href: "/en/guides/../visa", title: "Bad" },
    { href: "/en/guides/visa", title: " " },
    { href: "/en/guides/visa", title: "x".repeat(201) },
  ]) {
    assert.equal(
      queryImmigrationPolicies({ nationalityISO: "XY", arrivalDate: "2027-01-01" }, [], {
        ...queryContext,
        visaGuide,
      }).visaGuide,
      null,
    );
  }
  assert.deepEqual(
    queryImmigrationPolicies({ nationalityISO: null, arrivalDate: "2026-01-01" }, [], {
      ...queryContext,
      visaGuide: { href: "/zh/guides/visa", title: "签证指引" },
    }).visaGuide,
    { href: "/zh/guides/visa", title: "签证指引" },
  );
});

test("configuration date errors are not silently mistaken for invalid visitor input", () => {
  assert.throws(
    () =>
      queryImmigrationPolicies({ nationalityISO: "XY", arrivalDate: "2026-01-01" }, [], {
        ...queryContext,
        verifiedOnOrBefore: "bad",
      }),
    /核实日期基准无效/,
  );
});

test("query is identical across timezones without implicit clock, network, storage or extra logging", async () => {
  const program = `
    import { queryImmigrationPolicies } from './src/lib/immigration-policy-query.ts';
    import { queryContext, queryPolicy } from './tests/helpers/policy-query-fixture.ts';
    const OriginalDate = Date;
    globalThis.Date = class extends OriginalDate {
      constructor(...args) {
        if (!args.length) throw Error('Implicit clock forbidden');
        super(...args);
      }
      static now() { throw Error('Clock forbidden'); }
    };
    globalThis.fetch = () => { throw Error('Network forbidden'); };
    for (const key of ['localStorage', 'sessionStorage']) {
      Object.defineProperty(globalThis, key, { get() { throw Error('Storage forbidden'); } });
    }
    const dates = ['2026-12-30', '2026-12-31', '2027-01-01', '2026-01-01', '2025-12-31', '2026-02-29'];
    const results = dates.map(arrivalDate => queryImmigrationPolicies(
      { nationalityISO: 'XY', arrivalDate }, [queryPolicy()], queryContext
    ));
    process.stdout.write(JSON.stringify(results));
  `;
  const outputs = [];
  for (const TZ of ["UTC", "Asia/Shanghai", "America/Los_Angeles"]) {
    const { stdout, stderr } = await promisify(execFile)(
      process.execPath,
      ["--experimental-strip-types", "--input-type=module", "-e", program],
      { cwd: process.cwd(), env: { ...process.env, TZ }, timeout: 10_000 },
    );
    assert.equal(stderr, "");
    const results = JSON.parse(stdout) as { status: string; matches: unknown[] }[];
    assert.deepEqual(
      results.map((result) => result.status),
      ["matched", "matched", "unconfirmed", "matched", "unconfirmed", "invalid-input"],
    );
    assert.deepEqual(
      results.map((result) => result.matches.length),
      [1, 1, 0, 1, 0, 0],
    );
    outputs.push(stdout);
  }
  assert.equal(outputs[0], outputs[1]);
  assert.equal(outputs[1], outputs[2]);
});
