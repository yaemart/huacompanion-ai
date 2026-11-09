import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { Inquiries, Providers } from "../../src/cms/collections";
import type { Field } from "payload";

const url = new URL(process.env.DATABASE_URL || "http://invalid");
assert.equal(process.env.APP_ENV, "local");
assert.equal(url.hostname, "127.0.0.1");
assert.ok(
  (url.port === "55442" && /^\/hua_editor_e1_[a-f0-9]{32}$/.test(url.pathname)) ||
    (url.port === "55438" && url.pathname === "/hua_companion" && process.env.CI === "true"),
  "Only disposable E1 clone or CI database",
);
function named(fields: Field[]): Field[] {
  return fields.flatMap((f) => ("name" in f ? [f] : "fields" in f ? named(f.fields) : []));
}
for (const collection of [Inquiries, Providers]) {
  const first = collection.fields[0];
  const last = collection.fields.at(-1)!;
  assert.equal(first.type, "collapsible");
  assert.equal(last.type, "collapsible");
  if (first.type !== "collapsible" || last.type !== "collapsible") throw Error("layout");
  assert.equal(first.admin?.initCollapsed, false);
  assert.equal(last.admin?.initCollapsed, true);
  assert.ok(named(first.fields).some((f) => "name" in f && f.name === "status"));
  assert.ok(named(last.fields).some((f) => "name" in f && f.name === "reference"));
  const fields = named(collection.fields);
  assert.equal(new Set(fields.map((f) => "name" in f && f.name)).size, fields.length);
  const details = fields.find((f) => "name" in f && f.name === "details")!;
  assert.equal(details.type, "json");
  assert.equal(details.admin?.readOnly, true);
  assert.equal(details.admin?.components?.Field, "/cms/IntakeDetailsField#IntakeDetailsField");
}
const p = await getPayload({ config });
const run = `e1-${randomUUID()}`;
const staffIDs: number[] = [];
const records: { collection: "inquiries" | "providers"; id: number }[] = [];
const teamIDs: number[] = [];
try {
  const admin = await p.create({
    collection: "staff",
    overrideAccess: true,
    context: { allowLocalStaffSetup: true },
    data: { name: run, email: `${run}@example.invalid`, password: randomUUID(), role: "admin" },
  });
  staffIDs.push(admin.id);
  const team = await p.create({
    collection: "teams",
    overrideAccess: false,
    user: admin,
    data: { name: run },
  });
  teamIDs.push(team.id);
  const foreignTeam = await p.create({
    collection: "teams",
    overrideAccess: false,
    user: admin,
    data: { name: `${run}-foreign` },
  });
  teamIDs.push(foreignTeam.id);
  const staff = async (
    role: "manager" | "operations" | "reviewer",
    suffix: string,
    assignedTeam = team.id,
  ) => {
    const user = await p.create({
      collection: "staff",
      overrideAccess: false,
      user: admin,
      data: {
        name: suffix,
        email: `${run}-${suffix}@example.invalid`,
        password: randomUUID(),
        role,
        team: assignedTeam,
      },
    });
    staffIDs.push(user.id);
    return user;
  };
  const op = await staff("operations", "op");
  const other = await staff("operations", "other");
  const manager = await staff("manager", "manager");
  const reviewer = await staff("reviewer", "reviewer");
  const foreignManager = await staff("manager", "foreign-manager", foreignTeam.id);
  for (const collection of ["inquiries", "providers"] as const) {
    const original = { purpose: "虚构原始内容", people: "2", consent: true };
    const data = {
      reference: `${run}-${collection}`,
      name: "虚构客户",
      email: "demo@example.invalid",
      city: "Shanghai",
      categories: ["business" as const],
      requestKey: randomUUID(),
      contentHash: run,
      details: original,
      team: team.id,
      owner: op.id,
    };
    const record =
      collection === "providers"
        ? await p.create({
            collection,
            overrideAccess: true,
            user: admin,
            data: {
              ...data,
              status: "applied",
              organisation: "虚构服务商",
              phone: "000",
              languages: "en",
              capabilities: "虚构演示",
            },
          })
        : await p.create({
            collection,
            overrideAccess: true,
            user: admin,
            data: { ...data, status: "new" },
          });
    records.push({ collection, id: record.id });
    for (const user of [admin, manager, op]) {
      const read = await p.findByID({
        collection,
        id: record.id,
        overrideAccess: false,
        user,
        depth: 0,
      });
      assert.deepEqual(read.details, original);
      assert.ok(!("requestKey" in read));
      assert.ok(!("contentHash" in read));
    }
    for (const user of [other, foreignManager, reviewer, undefined]) {
      try {
        const read = await p.find({
          collection,
          overrideAccess: false,
          user,
          depth: 0,
          where: { id: { equals: record.id } },
        });
        assert.equal(read.totalDocs, 0);
      } catch (error) {
        assert.equal((error as { status?: number }).status, 403);
      }
      await assert.rejects(
        p.update({
          collection,
          id: record.id,
          overrideAccess: false,
          user,
          data: { name: "越权" },
        }),
      );
    }
    const saved = await p.update({
      collection,
      id: record.id,
      overrideAccess: false,
      user: op,
      data: { name: "虚构改名", details: { purpose: "篡改" }, source: "manual" },
    });
    assert.equal(saved.name, "虚构改名");
    assert.equal(saved.notes ?? null, null);
    assert.deepEqual(saved.details, original);
    assert.equal(saved.source, "website");
    if (collection === "providers") {
      const attempted = await p.update({
        collection,
        id: record.id,
        overrideAccess: false,
        user: manager,
        data: { status: "verified", publicApproved: true },
      });
      assert.equal(attempted.status, "applied");
      assert.equal(attempted.publicApproved, false);
    }
  }
  console.log(
    "PASS E1 field layout, exact paths, original protected data, assigned reads/writes, denied unrelated roles and existing supplier review boundary",
  );
} finally {
  for (const record of records) await p.delete({ ...record, overrideAccess: true });
  for (const id of staffIDs.reverse())
    await p.delete({ collection: "staff", id, overrideAccess: true });
  for (const id of teamIDs) await p.delete({ collection: "teams", id, overrideAccess: true });
  await p.destroy();
}
process.exit(0);
