import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPayload, type Payload } from "payload";
import config from "../../src/payload.config";
import { policyCsvHeaders } from "../../src/lib/policy-csv-import";
import { importPolicyCsv } from "../../src/server/immigration/csv-import";
import { relationID } from "../../src/cms/access";

const url = new URL(process.env.DATABASE_URL || "");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(process.env.APP_ENV, "local");
assert.ok(
  (url.port === "55442" && /^\/hua_quote_lines_[a-f0-9]{32}$/.test(url.pathname)) ||
    (url.port === "55438" && url.pathname === "/hua_companion" && process.env.CI === "true"),
);
const p = await getPayload({ config });
const key = randomUUID();
const targets = ["xy-other-policy", "xz-other-policy"];
const header = policyCsvHeaders.join(",");
const row = (country: string) =>
  `${country},other,30,days,2026-01-01,,,https://example.invalid,2026-01-01,仅演示,Demo only,,`;
const csv = [header, row("XY"), row("XZ")].join("\n");
const groups = () =>
  p.find({ collection: "policy-groups", where: { contentKey: { in: targets } }, depth: 0 });
let cleanTargets = false;
try {
  const [admin] = (
    await p.find({ collection: "staff", where: { role: { equals: "admin" } }, limit: 1 })
  ).docs;
  assert.ok(admin);
  const staff = (role: "editor" | "reviewer") =>
    p.create({
      collection: "staff",
      user: admin,
      data: {
        name: key,
        email: `${role}-${key}@example.invalid`,
        password: key,
        role,
        contentKinds: ["immigration-policy"],
      },
    });
  const editor = await staff("editor");
  const reviewer = await staff("reviewer");
  assert.equal((await groups()).totalDocs, 0);
  cleanTargets = true;
  await assert.rejects(importPolicyCsv(p, reviewer, csv, true), { status: 403 });
  const checked = await importPolicyCsv(p, editor, csv, false);
  assert.deepEqual(checked, { total: 2, issues: [], created: [] });
  assert.equal((await groups()).totalDocs, 0);
  const invalid = await importPolicyCsv(p, editor, [csv, row("ZZ"), row("XY")].join("\n"), true);
  assert.deepEqual(
    invalid.issues.map((issue) => issue.line),
    [2, 4, 5],
  );
  assert.equal((await groups()).totalDocs, 0);
  const failed = new Proxy(p, {
    get(target, property, receiver) {
      if (property === "create")
        return (input: Parameters<Payload["create"]>[0]) => {
          if (input.collection === "policy-note-drafts") throw Error("fixture rollback");
          return target.create(input);
        };
      return Reflect.get(target, property, receiver);
    },
  });
  await assert.rejects(importPolicyCsv(failed, editor, csv, true), /fixture rollback/);
  assert.equal((await groups()).totalDocs, 0);
  const result = await importPolicyCsv(p, editor, csv, true);
  assert.equal(result.created.length, 2);
  for (const { groupId } of result.created) {
    const group = await p.findByID({ collection: "policy-groups", id: groupId, depth: 0 });
    assert.equal(group.activeFactVersion ?? null, null);
    for (const collection of ["policy-fact-drafts", "policy-note-drafts"] as const) {
      const { docs } = await p.find({
        collection,
        where: { group: { equals: groupId } },
        depth: 0,
      });
      assert.equal(docs.length, collection === "policy-fact-drafts" ? 1 : 2);
      assert.ok(
        docs.every((draft) => draft.reviewState === "draft" && draft.lastEditedBy === editor.id),
      );
    }
  }
  const { docs: audits } = await p.find({
    collection: "audit-events",
    where: {
      action: { equals: "csv-import" },
      recordId: { equals: String(result.created[0].groupId) },
    },
    depth: 0,
  });
  assert.equal(audits.length, 1);
  assert.equal(relationID(audits[0].actor), editor.id);
  const duplicate = await importPolicyCsv(p, editor, csv, true);
  assert.equal(duplicate.issues.length, 2);
  assert.deepEqual(duplicate.created, []);
  await p.update({ collection: "staff", id: editor.id, user: admin, data: { contentKinds: [] } });
  await assert.rejects(importPolicyCsv(p, editor, csv, false), { status: 403 });
  console.log("PASS preview, row validation, batch rollback, drafts, audit and policy permissions");
} finally {
  try {
    const ids = cleanTargets ? (await groups()).docs.map((group) => group.id) : [];
    if (ids.length) {
      const where = { group: { in: ids } };
      await p.delete({ collection: "policy-note-drafts", where });
      await p.delete({ collection: "policy-fact-drafts", where });
      await p.delete({
        collection: "audit-events",
        where: { entity: { equals: "policy-group" }, recordId: { in: ids.map(String) } },
      });
      await p.delete({ collection: "policy-groups", where: { id: { in: ids } } });
    }
  } finally {
    await p.destroy();
  }
}
process.exit(0);
