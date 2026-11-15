import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { POST } from "../../src/app/(frontend)/api/monthly-performance-export/route";
import { exportMonthlyPerformance } from "../../src/server/performance/monthly-export";
import { defaultScorecardRules } from "../../src/lib/staff-scorecard";
import { performanceMonth } from "../../src/lib/staff-monthly-performance";

const url = new URL(process.env.DATABASE_URL || "");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(process.env.APP_ENV, "local");
assert.ok(
  (url.port === "55442" && /^\/hua_quote_lines_[a-f0-9]{32}$/.test(url.pathname)) ||
    (url.port === "55438" && url.pathname === "/hua_companion" && process.env.CI === "true"),
);
const p = await getPayload({ config });
const key = randomUUID();
const now = Date.now();
const period = performanceMonth(undefined, now)!;
const month = period.month;
const origin = process.env.APP_URL!;
const raw = "PRIVATE-MONTHLY-EVIDENCE-" + key;
try {
  const admin = (
    await p.find({
      collection: "staff",
      where: { role: { equals: "admin" }, active: { not_equals: false } },
      limit: 1,
    })
  ).docs[0];
  assert.ok(admin);
  const staff = (
    label: string,
    role: "operations" | "manager" | "admin",
    name: string,
    active = true,
  ) =>
    p.create({
      collection: "staff",
      user: admin,
      data: { email: label + key + "@example.invalid", password: key, role, name, active },
    });
  const owner = await staff("csv-owner-", "operations", '=HYPERLINK("fixture")' + key);
  const manager = await staff("csv-manager-", "manager", "csv-manager-" + key);
  const inactive = await staff("csv-inactive-", "operations", "csv-inactive-" + key, false);
  const token = async (email: string) =>
    "JWT " + (await p.login({ collection: "staff", data: { email, password: key } })).token;
  const ownerToken = await token(owner.email);
  const managerToken = await token(manager.email);
  const exportAdmin = await staff("csv-admin-", "admin", "csv-admin-" + key);
  const adminToken = await token(exportAdmin.email);
  const send = (authorization: string, data: object, from = origin) =>
    POST(
      new Request(origin + "/api/monthly-performance-export", {
        method: "POST",
        headers: { authorization, origin: from, "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    );

  const rules = defaultScorecardRules();
  rules.trialStart = month;
  rules.assignments[String(owner.id)] = "operations";
  await p.create({
    collection: "scorecard-plans",
    data: { key: month, effectiveMonth: month, revision: 1, configuration: rules },
  });

  const insert = async (label: string, staffID: number, time: string, confirmedAt?: string) => {
    const saved = await p.db.pool.query<{ id: number }>(
      `INSERT INTO performance_incidents
        (key, source, state, source_record, source_version, title, evidence, occurred_at,
         reported_by, participants, responsibility, created_at, first_confirmed_at)
       VALUES ($1, 'case', $2, 1, 1, $3, $3, $4, $5, '{}', 'company', $4, $6) RETURNING id`,
      [key + label, confirmedAt ? "confirmed" : "pending", raw, time, staffID, confirmedAt],
    );
    return saved.rows[0].id;
  };
  const owned = await insert("first", owner.id, period.start);
  const other = await insert("other", manager.id, period.start);
  const prior = await insert(
    "last-month",
    owner.id,
    new Date(Date.parse(period.start) - 1).toISOString(),
  );
  const next = await insert("next-month", owner.id, period.end);

  const denied = await Promise.all([
    send("", { month }),
    send(ownerToken, { month, staff: "" }),
    send(ownerToken, { month, staff: String(manager.id) }),
    send(managerToken, { month, staff: String(owner.id) }),
    send(adminToken, { month }, "https://example.invalid"),
  ]);
  assert.deepEqual(
    denied.map(({ status }) => status),
    [403, 403, 403, 403, 403],
  );
  assert.ok(denied.every((result) => !result.headers.has("content-disposition")));
  assert.equal((await send(adminToken, { month: "2099-12" })).status, 400);
  assert.equal((await send(adminToken, { month, staff: "2147483647" })).status, 404);
  assert.equal((await send(ownerToken, { month, includeSensitive: true })).status, 400);

  const ownResult = await send(ownerToken, { month });
  assert.equal(ownResult.status, 200, await ownResult.clone().text());
  assert.equal(ownResult.headers.get("content-type"), "text/csv; charset=utf-8");
  assert.equal(ownResult.headers.get("cache-control"), "private, no-store");
  assert.equal(
    ownResult.headers.get("content-disposition"),
    'attachment; filename="staff-monthly-' + month + '.csv"',
  );
  assert.equal(ownResult.headers.get("x-export-count"), "9");
  const ownBytes = new Uint8Array(await ownResult.arrayBuffer());
  assert.deepEqual([...ownBytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  const csv = new TextDecoder().decode(ownBytes);
  assert.match(csv, /"'=HYPERLINK\(""fixture""\)/);
  assert.match(csv, /试行观察/);
  assert.match(csv, /待定记录","服务投诉","待确认"/);
  assert.match(csv, new RegExp('"' + owned + '",""\r\n'));
  for (const hidden of [other, prior, next])
    assert.doesNotMatch(csv, new RegExp('"' + hidden + '",""\r\n'));
  for (const hidden of [manager.name, inactive.name, owner.email, raw, "总分", "扣分", "内部备注"])
    assert.equal(csv.includes(hidden), false, hidden);

  const selected = await send(adminToken, { month, staff: String(inactive.id) });
  assert.equal(selected.status, 200);
  const selectedCsv = await selected.text();
  assert.ok(selectedCsv.includes(inactive.name));
  assert.ok(!selectedCsv.includes(manager.name));
  const batch = await send(adminToken, { month, staff: "" });
  assert.equal(batch.status, 200);
  const all = await batch.text();
  assert.ok(all.includes(inactive.name) && all.includes(manager.name));
  assert.match(all, new RegExp('"' + other + '",""\r\n'));
  assert.equal(
    new Set(
      all
        .split("\r\n")
        .slice(1, -1)
        .map((line) => line.split('","')[1]),
    ).size,
    1,
  );
  const peopleCount = (await p.count({ collection: "staff" })).totalDocs;

  const first = new Date(Date.parse(period.end) - 60000).toISOString();
  const later = Date.parse(period.end) + 3300000;
  const incident = await insert("appealed", owner.id, first, first);
  const finding = (
    await p.db.pool.query<{ id: number }>(
      `INSERT INTO performance_findings (incident_id, staff_id, duty, summary, notified_at, appeal_at)
     VALUES ($1, $2, 'service', $3, $4, $5) RETURNING id`,
      [incident, owner.id, raw, first, new Date(later - 60000)],
    )
  ).rows[0].id;
  const reviewing = await exportMonthlyPerformance(p, owner, { month }, later);
  assert.match(reviewing.csv, /待定记录","服务投诉","申诉待复核"/);
  assert.match(reviewing.csv, /个人有效投诉数","待定","0"/);
  await p.db.pool.query(
    "UPDATE performance_findings SET resolved_at = $2, result = 'upheld' WHERE id = $1",
    [finding, new Date(later)],
  );
  await p.create({
    collection: "audit-events",
    data: {
      entity: "performance-incident",
      action: "resolve",
      recordId: String(incident),
      actor: admin.id,
      after: { finding, result: "upheld", at: new Date(later).toISOString(), reason: raw },
    },
  });
  const settled = await exportMonthlyPerformance(p, owner, { month }, later + 1000);
  assert.match(settled.csv, /个人有效投诉数","样本满足","1"/);
  assert.match(settled.csv, /复核更新","申诉复核","维持判定"/);
  assert.doesNotMatch(settled.csv, /申诉待复核|PRIVATE-MONTHLY-EVIDENCE/);

  const auditUnavailable = new Proxy(p, {
    get(target, property) {
      if (property === "create")
        return () => {
          throw Error("fixture audit unavailable");
        };
      return Reflect.get(target, property);
    },
  });
  await assert.rejects(
    exportMonthlyPerformance(auditUnavailable, owner, { month }, later),
    /audit unavailable/,
  );

  let changed = false;
  const revokedDuringExport = new Proxy(p, {
    get(target, prop) {
      if (prop !== "findByID") return Reflect.get(target, prop);
      return async (input: Parameters<typeof p.findByID>[0]) => {
        const row = await p.findByID(input);
        if (!changed && input.collection === "staff" && input.id === exportAdmin.id) {
          changed = true;
          await p.update({
            collection: "staff",
            id: exportAdmin.id,
            user: admin,
            data: { role: "operations" },
          });
        }
        return row;
      };
    },
  });
  await assert.rejects(
    exportMonthlyPerformance(revokedDuringExport, exportAdmin, { month }, later),
    /权限已变更/,
  );
  assert.ok(changed);

  const audits = (
    await p.find({
      collection: "audit-events",
      where: { entity: { equals: "staff-monthly-performance" } },
      pagination: false,
      depth: 0,
      sort: "id",
    })
  ).docs;
  assert.equal(audits.length, 5);
  assert.equal(audits[0].actor, owner.id);
  const firstAudit = audits[0].after as {
    filters: unknown;
    count: number;
    asOf: string;
    includeSensitive: boolean;
  };
  assert.deepEqual(firstAudit.filters, { month, staff: owner.id, scope: "self" });
  assert.equal(firstAudit.count, 9);
  assert.ok(firstAudit.asOf && !firstAudit.includeSensitive);
  const renderedCutoff = new Date(Date.parse(firstAudit.asOf) + 8 * 3600000)
    .toISOString()
    .replace("T", " ")
    .replace("Z", "+08:00");
  assert.ok(csv.includes(renderedCutoff));
  const batchAudit = audits[2].after as { employees: number; count: number; filters: unknown };
  assert.deepEqual(batchAudit.filters, { month, staff: null, scope: "all" });
  assert.equal(batchAudit.employees, peopleCount);
  assert.equal(batchAudit.count, Number(batch.headers.get("x-export-count")));
  assert.equal((audits[4].after as { asOf: string }).asOf, new Date(later + 1000).toISOString());
  const scopeAudit = audits[1].after as { filters: unknown };
  assert.deepEqual(scopeAudit.filters, { month, staff: inactive.id, scope: "employee" });
  console.log(
    "PASS self/admin scopes, Beijing boundary, pending and resolved CSV, formula escaping, audit and fail-closed download",
  );
} finally {
  await p.destroy();
}
process.exit(0);
