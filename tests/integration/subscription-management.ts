import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Payload } from "payload";
import { GET } from "../../src/app/(frontend)/api/subscriptions/manage/route";
import { SubscriptionManagement } from "../../src/components/subscriptions/SubscriptionManagement";
import { readSubscriptionManagement } from "../../src/server/subscription-management";

export async function testSubscriptionManagement(payload: Payload) {
  const key = randomUUID();
  const password = randomUUID();
  const people: number[] = [];
  const subscriptions: number[] = [];
  const makeStaff = async (role: "admin" | "manager" | "operations" | "editor" | "reviewer") => {
    const person = await payload.create({
      collection: "staff",
      context: { allowLocalStaffSetup: true },
      data: {
        name: role,
        email: `${role}-${people.length}-${key}@example.invalid`,
        role,
        active: true,
        password,
      },
    });
    people.push(person.id);
    return person;
  };
  const origin = new URL(process.env.APP_URL!).origin;
  const request = (token = "", query = "") =>
    GET(
      new Request(origin + "/api/subscriptions/manage" + query, {
        headers: token ? { authorization: `JWT ${token}` } : {},
      }),
    );
  try {
    const keeper = await makeStaff("admin");
    const admin = await makeStaff("admin");
    const token = (
      await payload.login({
        collection: "staff",
        data: { email: admin.email, password },
      })
    ).token!;
    const topic = `exhibition:fixture-${key}`;
    for (let i = 0; i < 28; i++) {
      const record = await payload.create({
        collection: "subscriptions",
        data: {
          email: `reader-${i}-${key}@example.invalid`,
          topic,
          locale: i % 2 ? "en" : "zh",
          status: (["pending", "confirmed", "unsubscribed"] as const)[i % 3],
          consentVersion: 1,
          consentedAt: "2026-11-18T16:00:00.000Z",
          privacyVersion: "PRIVATE-VERSION",
          sourcePath: "/en",
          partnerCode: "PRIVATE-PARTNER",
        },
      });
      subscriptions.push(record.id);
    }
    assert.equal((await request()).status, 403);
    await assert.rejects(readSubscriptionManagement(payload, null, {}), { status: 403 });
    for (const role of ["manager", "operations", "editor", "reviewer"] as const) {
      const person = await makeStaff(role);
      await assert.rejects(readSubscriptionManagement(payload, { ...person, role: "admin" }, {}), {
        status: 403,
      });
      const login = await payload.login({
        collection: "staff",
        data: { email: person.email, password },
      });
      const denied = await request(login.token!);
      assert.equal(denied.status, 403);
      assert.ok(!(await denied.text()).includes(key));
    }
    const result = await readSubscriptionManagement(payload, admin, { topic });
    assert.equal(result.total, 28);
    assert.equal(result.rows.length, 25);
    assert.equal(result.pages, 2);
    const stat = result.topics.find((row) => row.topic === topic);
    assert.deepEqual(stat && [stat.pending, stat.confirmed, stat.unsubscribed], [10, 9, 9]);
    const second = await readSubscriptionManagement(payload, admin, { topic, page: "2" });
    assert.equal(second.rows.length, 3);
    assert.equal(new Set([...result.rows, ...second.rows].map((row) => row.id)).size, 28);
    const concurrent = await Promise.all(
      Array.from({ length: 12 }, () => readSubscriptionManagement(payload, admin, { topic })),
    );
    assert.ok(
      concurrent.every((report) => report.total === 28),
      "parallel readers release snapshot connections before checking authority",
    );
    const filtered = await readSubscriptionManagement(payload, admin, {
      topic,
      status: "confirmed",
    });
    assert.equal(filtered.total, 9);
    assert.ok(filtered.rows.every((row) => row.status === "confirmed"));
    assert.ok(Number.isFinite(Date.parse(filtered.asOf)));
    const api = await request(token, "?topic=" + encodeURIComponent(topic));
    assert.equal(api.status, 200);
    assert.match(api.headers.get("cache-control") ?? "", /no-store/);
    const json = await api.json();
    assert.deepEqual(Object.keys(json.rows[0]).sort(), [
      "confirmedAt",
      "consentedAt",
      "email",
      "id",
      "locale",
      "status",
      "topic",
      "unsubscribedAt",
    ]);
    assert.doesNotMatch(
      JSON.stringify(json),
      /PRIVATE-VERSION|PRIVATE-PARTNER|tokenHash|policySelection|consentVersion/,
    );
    for (const query of [
      "?status=anything",
      "?topic=__proto__",
      "?page=0",
      "?page=1.1",
      "?page=1&page=2",
      "?limit=100000",
    ])
      assert.equal((await request(token, query)).status, 400);
    const html = renderToStaticMarkup(createElement(SubscriptionManagement, { report: result }));
    assert.match(html, /待确认/);
    assert.match(html, /已订阅/);
    assert.match(html, /已退订/);
    assert.match(html, /2026-11-19/);
    assert.match(html, /下一页/);
    assert.doesNotMatch(html, /PRIVATE-VERSION|PRIVATE-PARTNER|tokenHash/);
    await payload.update({
      collection: "staff",
      user: keeper,
      id: admin.id,
      data: { role: "operations" },
    });
    await assert.rejects(readSubscriptionManagement(payload, admin, {}), { status: 403 });
    assert.equal((await request(token)).status, 403);
    await payload.update({
      collection: "staff",
      user: keeper,
      id: admin.id,
      data: { role: "admin", active: false },
    });
    assert.equal((await request(token)).status, 403);
    console.log("PASS 管理员订阅统计、筛选分页、隐私字段和撤权拒绝");
  } finally {
    for (const id of subscriptions) await payload.delete({ collection: "subscriptions", id });
    for (const id of people) await payload.delete({ collection: "staff", id });
  }
}
