import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Payload } from "payload";
import pg from "pg";
import { POST } from "../../src/app/(frontend)/api/subscriptions/export/route";
import { exportSubscriptionCsv } from "../../src/server/subscription-export";

export async function testSubscriptionCsv(payload: Payload, url: URL) {
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  const key = randomUUID();
  const password = randomUUID();
  const topic = `exhibition:csv-${key}`;
  const people: number[] = [];
  const ids: number[] = [];
  const person = async (role: "admin" | "manager" | "operations" | "editor" | "reviewer") => {
    const record = await payload.create({
      collection: "staff",
      context: { allowLocalStaffSetup: true },
      data: {
        name: role,
        email: `csv-${people.length}-${key}@example.invalid`,
        role,
        active: true,
        password,
      },
    });
    people.push(record.id);
    return record;
  };
  const origin = new URL(process.env.APP_URL!).origin;
  const request = (token = "", input: unknown = { topic }, source = origin) =>
    POST(
      new Request(origin + "/api/subscriptions/export", {
        method: "POST",
        headers: {
          Origin: source,
          "Content-Type": "application/json",
          ...(token ? { authorization: `JWT ${token}` } : {}),
        },
        body: JSON.stringify(input),
      }),
    );
  try {
    const keeper = await person("admin");
    const admin = await person("admin");
    const token = (
      await payload.login({ collection: "staff", data: { email: admin.email, password } })
    ).token!;
    for (let i = 0; i < 28; i++) {
      const record = await payload.create({
        collection: "subscriptions",
        data: {
          email: `csv-${i}-${key}@example.invalid`,
          topic,
          locale: i % 2 ? "zh" : "en",
          status: i === 27 ? "unsubscribed" : i % 2 ? "pending" : "confirmed",
          consentVersion: 1,
          consentedAt: "2026-11-18T16:00:00.000Z",
          confirmedAt: i % 2 ? null : "2026-11-19T00:00:00.000Z",
          unsubscribedAt: i === 27 ? "2026-11-19T01:00:00.000Z" : null,
          privacyVersion: "PRIVATE-CSV-VERSION",
          sourcePath: "/en",
          partnerCode: "PRIVATE-CSV-PARTNER",
        },
      });
      ids.push(record.id);
    }
    const attacks = [
      "=1+1@example.invalid",
      "+reader@example.invalid",
      "-reader@example.invalid",
      "@legacy@example.invalid",
    ];
    for (let i = 0; i < attacks.length; i++)
      await db.query("UPDATE subscriptions SET email=$1 WHERE id=$2", [attacks[i], ids[i]]);
    assert.equal((await request()).status, 403);
    for (const role of ["manager", "operations", "editor", "reviewer"] as const) {
      const who = await person(role);
      await assert.rejects(exportSubscriptionCsv(payload, { ...who, role: "admin" }, { topic }), {
        status: 403,
      });
      const login = await payload.login({
        collection: "staff",
        data: { email: who.email, password },
      });
      assert.equal((await request(login.token)).status, 403);
    }
    assert.equal((await request(token, { topic }, "https://external.invalid")).status, 403);
    for (const input of [
      { topic, page: "2" },
      { topic, includeSensitive: true },
      { status: "all" },
      null,
      [],
    ])
      assert.equal((await request(token, input)).status, 400);
    const before = await payload.count({
      collection: "audit-events",
      where: { entity: { equals: "subscriptions" }, action: { equals: "csv-export" } },
    });
    const response = await request(token);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-export-count"), "28");
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    assert.match(response.headers.get("content-type") ?? "", /text\/csv.*utf-8/);
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.deepEqual(Array.from(bytes.slice(0, 3)), [239, 187, 191]);
    const csv = Buffer.from(bytes).toString("utf8");
    for (const attack of attacks) assert.ok(csv.includes('"' + "'" + attack + '"'));
    assert.equal(
      csv.split("\r\n").length,
      30,
      "header plus every matching record, including other pages",
    );
    assert.match(csv, /2026-11-19/);
    assert.match(csv, /待确认/);
    assert.match(csv, /已订阅/);
    assert.match(csv, /已退订/);
    assert.doesNotMatch(
      csv,
      /PRIVATE-CSV|tokenHash|policySelection|consentVersion|sourcePath|partnerCode/,
    );
    const audit = (
      await payload.find({
        collection: "audit-events",
        where: { entity: { equals: "subscriptions" }, action: { equals: "csv-export" } },
        sort: "-id",
        limit: 1,
        depth: 0,
      })
    ).docs[0];
    assert.equal(audit.actor, admin.id);
    assert.deepEqual(audit.after, {
      filters: { topic, status: "" },
      count: 28,
      includeSensitive: false,
      asOf: response.headers.get("x-export-as-of"),
    });
    assert.ok(!JSON.stringify(audit.after).includes("@example.invalid"));
    const filtered = await request(token, { topic, status: "confirmed" });
    assert.equal(filtered.headers.get("x-export-count"), "14");
    const empty = await request(token, { topic: "exhibition:missing" });
    assert.equal(empty.headers.get("x-export-count"), "0");
    assert.equal((await empty.text()).split("\r\n").length, 2);
    await db.query(`
      CREATE FUNCTION reject_subscription_csv_commit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.entity='subscriptions' AND NEW.action='csv-export' THEN
        RAISE EXCEPTION 'fixture blocks export audit'; END IF; RETURN NEW; END $$;
      CREATE CONSTRAINT TRIGGER reject_subscription_csv_commit AFTER INSERT ON audit_events
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_subscription_csv_commit();
    `);
    try {
      const failed = await request(token);
      assert.equal(failed.status, 503);
      assert.ok(!(await failed.text()).includes(attacks[0]));
    } finally {
      await db.query(
        "DROP TRIGGER reject_subscription_csv_commit ON audit_events; DROP FUNCTION reject_subscription_csv_commit()",
      );
    }
    const after = await payload.count({
      collection: "audit-events",
      where: { entity: { equals: "subscriptions" }, action: { equals: "csv-export" } },
    });
    assert.equal(after.totalDocs, before.totalDocs + 3, "failed audit cannot return a CSV");
    let revoked = false;
    const revokedDuringRead = new Proxy(payload, {
      get(target, property) {
        if (property !== "findByID") return Reflect.get(target, property);
        return async (input: Parameters<typeof payload.findByID>[0]) => {
          const row = await payload.findByID(input);
          if (!revoked && input.collection === "staff" && input.id === admin.id) {
            revoked = true;
            await payload.update({
              collection: "staff",
              id: admin.id,
              user: keeper,
              data: { role: "operations" },
            });
          }
          return row;
        };
      },
    });
    await assert.rejects(exportSubscriptionCsv(revokedDuringRead, admin, { topic }), {
      status: 403,
    });
    assert.equal(revoked, true);
    await payload.update({
      collection: "staff",
      id: admin.id,
      user: keeper,
      data: { role: "operations" },
    });
    await assert.rejects(exportSubscriptionCsv(payload, admin, { topic }), { status: 403 });
    assert.equal((await request(token)).status, 403);
    console.log("PASS 订阅CSV管理员权限、全量筛选、BOM、公式防护、审计和提交失败拒绝");
  } finally {
    for (const id of ids) await payload.delete({ collection: "subscriptions", id });
    for (const id of people) await payload.delete({ collection: "staff", id });
    await db.end();
  }
}
