import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { GET } from "../../src/app/(frontend)/api/business/reply-templates/route";
import { replyCategories } from "../../src/lib/inquiry-reply-templates";
import { down } from "../../src/migrations/20261114_080000_inquiry_reply_templates";
import type { MigrateDownArgs } from "@payloadcms/db-postgres";
import pg from "pg";

const url = new URL(process.env.DATABASE_URL || "");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(process.env.APP_ENV, "local");
assert.ok(
  (url.port === "55442" && /^\/hua_quote_lines_[a-f0-9]{32}$/.test(url.pathname)) ||
    (url.port === "55438" && url.pathname === "/hua_companion" && process.env.CI === "true"),
);
const p = await getPayload({ config });
const key = randomUUID();
const password = randomUUID();
const collection = "inquiry-reply-templates";
try {
  const admin = (
    await p.find({ collection: "staff", where: { role: { equals: "admin" } }, limit: 1 })
  ).docs[0];
  assert.ok(admin);
  const team = await p.create({ collection: "teams", data: { name: key } });
  const otherTeam = await p.create({ collection: "teams", data: { name: "other-" + key } });
  const staff = (role: "operations" | "manager" | "reviewer", label: string, teamID = team.id) =>
    p.create({
      collection: "staff",
      user: admin,
      data: {
        role,
        team: teamID,
        name: label,
        email: `${label}-${key}@example.invalid`,
        password,
      },
    });
  const op = await staff("operations", "template-op");
  const peer = await staff("operations", "template-peer");
  const manager = await staff("manager", "template-manager");
  const other = await staff("manager", "template-foreign", otherTeam.id);
  const reviewer = await staff("reviewer", "template-reviewer");
  const inquiry = await p.create({
    collection: "inquiries",
    user: admin,
    data: {
      name: "虚构咨询保密姓名",
      email: "private-template-test@example.invalid",
      requestKey: key,
      contentHash: key,
      reference: `TEMPLATE-${key}`,
      city: "Shanghai",
      categories: ["business"],
      status: "new",
      team: team.id,
      owner: op.id,
    },
  });
  const localLogin = async (email: string) =>
    "JWT " + (await p.login({ collection: "staff", data: { email, password } })).token;
  const load = (auth: string, id = inquiry.id) =>
    GET(
      new Request(`http://127.0.0.1/api/business/reply-templates?inquiry=${id}`, {
        headers: { Authorization: auth },
      }),
    );
  const template = {
    title: key,
    category: "inquiry" as const,
    bodyZh: "虚构中文\n第二段",
    bodyEn: "Fictional English\nSecond paragraph",
  };
  for (const user of [op, manager, reviewer]) {
    const access = { collection, user, overrideAccess: false } as const;
    await assert.rejects(p.find(access), { status: 403 });
    await assert.rejects(p.create({ ...access, data: template }), { status: 403 });
  }
  const rows = await Promise.all(
    replyCategories.map(({ value: category }) =>
      p.create({
        collection,
        user: admin,
        overrideAccess: false,
        data: { ...template, category, title: `${key}-${category}` },
      }),
    ),
  );
  const hidden = await p.create({
    collection,
    user: admin,
    overrideAccess: false,
    data: { ...template, enabled: false },
  });
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  try {
    await assert.rejects(
      down({ db: { execute: (sql: string) => db.query(sql) } } as unknown as MigrateDownArgs),
      /Preserve configured inquiry reply templates/,
    );
  } finally {
    await db.end();
  }
  await assert.rejects(
    p.create({
      collection,
      user: admin,
      overrideAccess: false,
      data: { ...template, bodyEn: " " },
    }),
    { status: 400 },
  );
  await assert.rejects(
    p.update({
      collection,
      id: rows[0].id,
      user: op,
      overrideAccess: false,
      data: { bodyZh: "越权修改" },
    }),
    { status: 403 },
  );
  const opToken = await localLogin(op.email);
  const peerToken = await localLogin(peer.email);
  assert.equal((await load("")).status, 403);
  assert.equal((await load(await localLogin(reviewer.email))).status, 403);
  for (const actor of [peerToken, await localLogin(other.email)])
    assert.equal((await load(actor)).status, 404);
  assert.equal((await load(opToken, 2147483647)).status, 404);
  for (const actor of [opToken, await localLogin(manager.email)]) {
    const response = await load(actor);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const json = await response.json();
    assert.ok(!JSON.stringify(json).includes(inquiry.email));
    const visible = json.templates.filter((item: { title: string }) => item.title.startsWith(key));
    assert.deepEqual(
      visible.map((item: { id: number }) => item.id).sort(),
      rows.map((row) => row.id).sort(),
    );
    assert.ok(
      visible.every(
        (item: object) => Object.keys(item).sort().join() === "bodyEn,bodyZh,category,id,title",
      ),
    );
    assert.equal(visible[0].bodyZh, template.bodyZh);
    assert.equal(visible[0].bodyEn, template.bodyEn);
  }
  const active = await p.update({
    collection,
    id: hidden.id,
    user: admin,
    overrideAccess: false,
    data: { enabled: true },
  });
  assert.equal(active.enabled, true);
  const reloaded = await (await load(opToken)).json();
  assert.ok(reloaded.templates.some((item: { id: number }) => item.id === hidden.id));
  await p.update({
    collection: "inquiries",
    id: inquiry.id,
    user: admin,
    data: { owner: peer.id },
  });
  assert.equal((await load(opToken)).status, 404);
  assert.equal((await load(peerToken)).status, 200);
  await p.update({ collection: "staff", id: peer.id, user: admin, data: { active: false } });
  assert.equal((await load(peerToken)).status, 403);
  console.log(
    "PASS bilingual templates, three categories, enable toggle, scoped inquiry and administrative permissions",
  );
} finally {
  await p.delete({ collection, where: { title: { like: key } } });
  await p.destroy();
}
process.exit(0);
