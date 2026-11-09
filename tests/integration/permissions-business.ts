import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import type { Staff } from "../../payload-types";

if (
  process.env.APP_ENV !== "local" ||
  !process.env.DATABASE_URL?.includes("@127.0.0.1:55438/hua_companion")
)
  throw Error("Local test database required");
const p = await getPayload({ config });
const run = `permissions-${randomUUID().slice(0, 8)}`;
const password = randomBytes(24).toString("hex");
let passed = 0;
let fixtureAdmin: Staff | null = null;
const fixtureStaffIDs: number[] = [];
const check = (name: string) => {
  passed++;
  console.log(`PASS ${name}`);
};
const denied = async (fn: () => Promise<any>) => {
  try {
    const result = await fn();
    assert.equal(result.totalDocs, 0);
  } catch (error: any) {
    if (error?.status !== 403 && error?.status !== 404) throw error;
  }
};
try {
  const admin = await p.create({
    collection: "staff",
    overrideAccess: true,
    context: { allowLocalStaffSetup: true },
    data: { name: run, email: `${run}-admin@example.com`, password, role: "admin" },
  });
  fixtureAdmin = admin;
  fixtureStaffIDs.push(admin.id);
  const teamA = await p.create({
    collection: "teams",
    user: admin,
    overrideAccess: false,
    data: { name: `${run}-A` },
  });
  const teamB = await p.create({
    collection: "teams",
    user: admin,
    overrideAccess: false,
    data: { name: `${run}-B` },
  });
  const staff = async (
    role: "operations" | "manager" | "editor" | "reviewer",
    name: string,
    team = teamA.id,
  ) => {
    const created = await p.create({
      collection: "staff",
      user: admin,
      overrideAccess: false,
      data: { name: `${run}-${name}`, email: `${run}-${name}@example.com`, password, role, team },
    });
    fixtureStaffIDs.push(created.id);
    return created;
  };
  const opA = await staff("operations", "opA");
  const opB = await staff("operations", "opB", teamB.id);
  const manager = await staff("manager", "manager");
  const editor = await staff("editor", "editor");
  const reviewer = await staff("reviewer", "reviewer");
  assert.deepEqual(editor.contentKinds || [], []);
  check("new staff have no content boards by default");
  const inquiryData = (suffix: string) => ({
    status: "new" as const,
    reference: `${run}-${suffix}`,
    requestKey: randomUUID(),
    contentHash: run,
    name: "Fictional contact",
    email: `${run}@example.com`,
    categories: ["business" as const],
    city: "Shanghai",
    details: { original: true },
    catalogSource: { original: true },
  });
  const a = await p.create({
    collection: "inquiries",
    user: admin,
    overrideAccess: true,
    data: { ...inquiryData("A"), team: teamA.id, owner: opA.id },
  });
  const b = await p.create({
    collection: "inquiries",
    user: admin,
    overrideAccess: true,
    data: { ...inquiryData("B"), team: teamB.id, owner: opB.id },
  });
  const queue = await p.create({
    collection: "inquiries",
    user: admin,
    overrideAccess: true,
    data: { ...inquiryData("queue"), team: teamA.id },
  });
  const unassigned = await p.create({
    collection: "inquiries",
    user: admin,
    overrideAccess: true,
    data: inquiryData("unassigned"),
  });
  const filter = { id: { in: [a.id, b.id, queue.id, unassigned.id] } };
  assert.equal(
    (await p.count({ collection: "inquiries", user: opA, overrideAccess: false, where: filter }))
      .totalDocs,
    1,
  );
  assert.equal(
    (
      await p.count({
        collection: "inquiries",
        user: manager,
        overrideAccess: false,
        where: filter,
      })
    ).totalDocs,
    2,
  );
  assert.equal(
    (await p.count({ collection: "inquiries", user: admin, overrideAccess: false, where: filter }))
      .totalDocs,
    4,
  );
  await denied(() =>
    p.findByID({ collection: "inquiries", id: b.id, user: opA, overrideAccess: false }),
  );
  await denied(() => p.find({ collection: "inquiries", user: editor, overrideAccess: false }));
  await assert.rejects(() =>
    p.update({
      collection: "inquiries",
      id: b.id,
      user: manager,
      overrideAccess: false,
      data: { notes: "forbidden" },
    }),
  );
  check("inquiry lists, counts, direct reads and updates enforce team/owner isolation");
  await p.update({
    collection: "inquiries",
    id: queue.id,
    user: manager,
    overrideAccess: false,
    data: { owner: opA.id },
  });
  await assert.rejects(() =>
    p.update({
      collection: "inquiries",
      id: queue.id,
      user: manager,
      overrideAccess: false,
      data: { owner: opB.id },
    }),
  );
  await p.update({
    collection: "inquiries",
    id: a.id,
    user: opA,
    overrideAccess: false,
    data: {
      team: teamB.id,
      owner: opB.id,
      details: { forged: true },
      catalogSource: { forged: true },
      reference: "forged",
      name: "Allowed contact",
    },
  });
  const protectedRecord = await p.findByID({
    collection: "inquiries",
    id: a.id,
    overrideAccess: true,
    depth: 0,
  });
  assert.equal(protectedRecord.team, teamA.id);
  assert.equal(protectedRecord.owner, opA.id);
  assert.deepEqual(protectedRecord.details, { original: true });
  assert.deepEqual(protectedRecord.catalogSource, { original: true });
  assert.equal(protectedRecord.reference, a.reference);
  assert.equal(protectedRecord.name, "Allowed contact");
  await assert.rejects(() =>
    p.create({
      collection: "teams",
      user: manager,
      overrideAccess: false,
      data: { name: `${run}-forged` },
    }),
  );
  check("assignment guards and field protections resist team/owner/snapshot forgery");
  const provider = await p.create({
    collection: "providers",
    user: admin,
    overrideAccess: true,
    data: {
      ...inquiryData("provider"),
      status: "applied",
      organisation: run,
      phone: "00000000000",
      languages: "English",
      capabilities: "Fictional",
      team: teamA.id,
      owner: opA.id,
    },
  });
  assert.equal(
    (
      await p.findByID({
        collection: "providers",
        id: provider.id,
        user: opA,
        overrideAccess: false,
      })
    ).phone,
    "00000000000",
  );
  for (const user of [opB, editor, reviewer])
    await denied(() =>
      p.findByID({ collection: "providers", id: provider.id, user, overrideAccess: false }),
    );
  await p.update({
    collection: "providers",
    id: provider.id,
    user: opA,
    overrideAccess: false,
    data: { status: "contracted", publicApproved: true },
  });
  const privateProvider = await p.findByID({
    collection: "providers",
    id: provider.id,
    overrideAccess: true,
  });
  assert.equal(privateProvider.status, "applied");
  assert.equal(privateProvider.publicApproved, false);
  for (const collection of ["inquiries", "providers"] as const)
    await denied(() => p.findVersions({ collection, user: opA, overrideAccess: false }));
  await denied(() => p.find({ collection: "audit-events", user: manager, overrideAccess: false }));
  check("provider contacts, approval fields, historical versions and audit records stay protected");
  const logs = await p.find({
    collection: "audit-events",
    user: admin,
    overrideAccess: false,
    where: {
      and: [{ entity: { equals: "inquiries" } }, { recordId: { equals: String(queue.id) } }],
    },
    sort: "-createdAt",
  });
  assert.ok(logs.docs.some((doc: any) => doc.after?.owner === opA.id));
  check("assignment changes preserve redacted before/after audit snapshots");
  const login = await p.login({ collection: "staff", data: { email: opA.email, password } });
  const headers = new Headers({ Authorization: `JWT ${login.token}` });
  assert.equal((await p.auth({ headers })).user?.id, opA.id);
  await p.update({
    collection: "staff",
    id: opA.id,
    user: admin,
    overrideAccess: false,
    data: { contentKinds: ["guide"] },
  });
  assert.equal((await p.auth({ headers })).user, null);
  check("authority edits invalidate an issued JWT session immediately");
  const transferred = await p.update({
    collection: "staff",
    id: opA.id,
    user: admin,
    overrideAccess: false,
    data: { team: teamB.id },
  });
  await denied(() =>
    p.findByID({ collection: "inquiries", id: a.id, user: transferred, overrideAccess: false }),
  );
  await denied(() =>
    p.findByID({
      collection: "providers",
      id: provider.id,
      user: transferred,
      overrideAccess: false,
    }),
  );
  await p.update({
    collection: "staff",
    id: opA.id,
    user: admin,
    overrideAccess: false,
    data: { team: teamA.id },
  });
  check("staff team transfer immediately revokes old-team assignments");
  const freshLogin = await p.login({ collection: "staff", data: { email: opA.email, password } });
  await p.update({
    collection: "staff",
    id: opA.id,
    user: admin,
    overrideAccess: false,
    data: { active: false },
  });
  assert.equal(
    (await p.auth({ headers: new Headers({ Authorization: `JWT ${freshLogin.token}` }) })).user,
    null,
  );
  await assert.rejects(() =>
    p.login({ collection: "staff", data: { email: opA.email, password } }),
  );
  await assert.rejects(() =>
    p.delete({ collection: "staff", id: opA.id, user: admin, overrideAccess: false }),
  );
  await assert.rejects(() =>
    p
      .update({
        collection: "inquiries",
        id: queue.id,
        user: manager,
        overrideAccess: false,
        data: { owner: null },
      })
      .then(() =>
        p.update({
          collection: "inquiries",
          id: queue.id,
          user: manager,
          overrideAccess: false,
          data: { owner: opA.id },
        }),
      ),
  );
  check("disabled staff cannot log in, reuse tokens, be newly assigned or be deleted");
  console.log(
    `${passed} business permissions integration checks passed. Fictional records retained: ${run}`,
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  // Disable only exact IDs created by this run. Keep the fixture admin active until last.
  if (fixtureAdmin) {
    const cleanupOrder = [
      ...fixtureStaffIDs.filter((id) => id !== fixtureAdmin!.id),
      fixtureAdmin.id,
    ];
    for (const id of cleanupOrder) {
      try {
        await p.update({
          collection: "staff",
          id,
          user: fixtureAdmin,
          overrideAccess: false,
          data: { active: false },
        });
      } catch (error) {
        console.error(`Could not disable test fixture staff ${id}:`, error);
        process.exitCode = 1;
      }
    }
  }
  await p.destroy();
  process.exit(process.exitCode || 0);
}
