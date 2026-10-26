import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { saveIntake, IntakeConflict } from "../../src/server/intake";
if (
  process.env.APP_ENV !== "local" ||
  !process.env.DATABASE_URL?.includes("@127.0.0.1:55438/hua_companion")
)
  throw Error("Local test database required");
const payload = await getPayload({ config });
const run = randomUUID().slice(0, 8);
const base = {
  kind: "request",
  locale: "en",
  values: {
    categories: ["business"],
    city: "Shanghai",
    people: "2",
    datesUnknown: true,
    name: "Local integration test",
    email: `test-${run}@example.com`,
    language: "English",
    consent: true,
  },
};
let passed = 0;
const check = (name: string) => {
  passed++;
  console.log(`PASS ${name}`);
};
try {
  await assert.rejects(() =>
    payload.create({
      collection: "staff",
      overrideAccess: true,
      data: {
        name: "Forbidden bootstrap",
        email: `blocked-${run}@example.com`,
        password: randomBytes(24).toString("hex"),
        role: "admin",
      },
    }),
  );
  check("staff hook blocks unauthorized bootstrap even with access override");
  const key = randomUUID();
  const receipts = await Promise.all([
    saveIntake(base, key),
    saveIntake(base, key),
  ]);
  assert.equal(receipts[0].reference, receipts[1].reference);
  check("concurrent retries produce one reference");
  const docs = await payload.find({
    collection: "inquiries",
    overrideAccess: true,
    where: { reference: { equals: receipts[0].reference } },
    depth: 0,
  });
  assert.equal(docs.totalDocs, 1);
  const inquiry = docs.docs[0];
  assert.equal(
    (
      await payload.count({
        collection: "notifications",
        overrideAccess: true,
        where: { reference: { equals: inquiry.reference } },
      })
    ).totalDocs,
    1,
  );
  check("inquiry and one pending notification persist");
  await assert.rejects(
    () =>
      saveIntake({ ...base, values: { ...base.values, name: "Changed" } }, key),
    IntakeConflict,
  );
  check("idempotency key cannot be reused for changed input");
  const provider = await saveIntake(
    {
      kind: "apply",
      locale: "zh",
      values: {
        categories: ["interpretation"],
        city: "上海",
        organisation: "本地测试机构",
        name: "测试联系人",
        email: `provider-${run}@example.com`,
        phone: "00000000000",
        languages: "中文、英语",
        capabilities: "虚构测试服务能力",
        consent: true,
      },
    },
    randomUUID(),
  );
  const providers = await payload.find({
    collection: "providers",
    overrideAccess: true,
    where: { reference: { equals: provider.reference } },
  });
  assert.equal(providers.docs[0].status, "applied");
  assert.equal(providers.docs[0].publicApproved, false);
  check("provider submission remains private and applied");
  const fixtures = [];
  for (const role of ["operations", "editor"] as const) {
    fixtures.push(
      await payload.create({
        collection: "staff",
        overrideAccess: true,
        context: { allowLocalStaffSetup: true },
        data: {
          name: `测试-${role}`,
          email: `${role}-${run}@example.com`,
          password: randomBytes(24).toString("hex"),
          role,
        },
      }),
    );
  }
  const [operations, editor] = fixtures;
  for (const user of [null, editor])
    await assert.rejects(() =>
      payload.find({
        collection: "inquiries",
        user,
        overrideAccess: false,
        where: { id: { equals: inquiry.id } },
      }),
    );
  const unassigned = await payload.find({
    collection: "inquiries",
    user: operations,
    overrideAccess: false,
    where: { id: { equals: inquiry.id } },
  });
  assert.equal(unassigned.totalDocs, 0);
  check("anonymous/editor/unassigned operator cannot read inquiry");
  await payload.update({
    collection: "inquiries",
    id: inquiry.id,
    overrideAccess: true,
    data: { owner: operations.id },
  });
  const own = await payload.findByID({
    collection: "inquiries",
    id: inquiry.id,
    user: operations,
    overrideAccess: false,
  });
  assert.equal(own.reference, inquiry.reference);
  assert.equal(own.requestKey, undefined);
  assert.equal(own.contentHash, undefined);
  check("assigned operator reads inquiry without private deduplication fields");
  await assert.rejects(() =>
    payload.findVersions({
      collection: "inquiries",
      user: operations,
      overrideAccess: false,
    }),
  );
  check("historical snapshots are administrator-only");
  await payload.update({
    collection: "inquiries",
    id: inquiry.id,
    user: operations,
    overrideAccess: false,
    data: { status: "processing", notes: "测试跟进" },
  });
  check("assigned operator can update follow-up");
  await payload.update({
    collection: "inquiries",
    id: inquiry.id,
    user: operations,
    overrideAccess: false,
    data: { owner: editor.id },
  });
  const unchanged = await payload.findByID({
    collection: "inquiries",
    id: inquiry.id,
    overrideAccess: true,
    depth: 0,
  });
  assert.equal(unchanged.owner, operations.id);
  check("operator cannot reassign protected owner field");
  await assert.rejects(() =>
    payload.create({
      collection: "staff",
      user: editor,
      overrideAccess: false,
      data: {
        name: "Forbidden",
        email: `forbidden-${run}@example.com`,
        password: randomBytes(24).toString("hex"),
        role: "admin",
      },
    }),
  );
  check("editor cannot create an administrator");
  await assert.rejects(() =>
    payload.find({
      collection: "providers",
      user: editor,
      overrideAccess: false,
    }),
  );
  check("editor cannot access provider records");
  const logs = await payload.count({
    collection: "audit-events",
    overrideAccess: true,
    where: {
      and: [
        { entity: { equals: "inquiries" } },
        { recordId: { equals: String(inquiry.id) } },
      ],
    },
  });
  assert.ok(logs.totalDocs >= 2);
  check("changes have audit records");
  console.log(
    `${passed} integration checks passed using real PostgreSQL. Fictional test records retained for review.`,
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await payload.destroy();
  process.exit(process.exitCode || 0);
}
