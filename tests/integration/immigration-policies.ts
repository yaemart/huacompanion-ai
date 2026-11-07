import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPayload } from "payload";
import config from "../../src/payload.config";

if (process.env.APP_ENV !== "local") throw Error("Local policy tests only");
const p = await getPayload({ config });
const admin = (
  await p.find({
    collection: "staff",
    where: { and: [{ role: { equals: "admin" } }, { active: { not_equals: false } }] },
    limit: 1,
    sort: "createdAt",
  })
).docs[0];
assert.ok(admin);
const key = `policy-test-${randomUUID()}`;
let id: number | undefined;
try {
  const draft = await p.create({
    collection: "immigration-policies",
    data: { policyKey: key, status: "draft", revision: 1 },
    overrideAccess: true,
  });
  id = draft.id;
  assert.equal(draft.status, "draft");
  assert.equal(draft.revision, 1);
  console.log("PASS partial policy draft defaults; no facts or publication fabricated");

  const detail = await p.findByID({
    collection: "immigration-policies",
    id,
    user: admin,
    overrideAccess: false,
  });
  assert.equal(detail.id, id);
  for (const user of [
    null,
    { ...admin, role: "editor" as const, additionalRoles: [] },
    { ...admin, role: "reviewer" as const, additionalRoles: [] },
    { ...admin, role: "operations" as const, additionalRoles: [] },
    { ...admin, active: false },
  ]) {
    await assert.rejects(() =>
      p.find({ collection: "immigration-policies", user, overrideAccess: false }),
    );
    await assert.rejects(() =>
      p.findVersions({ collection: "immigration-policies", user, overrideAccess: false }),
    );
  }
  console.log("PASS anonymous, non-admin and inactive staff cannot read policies or versions");

  for (const user of [null, admin]) {
    await assert.rejects(() =>
      p.create({
        collection: "immigration-policies",
        data: { policyKey: `${key}-denied`, status: "draft", revision: 1 },
        user,
        overrideAccess: false,
      }),
    );
    await assert.rejects(() =>
      p.update({
        collection: "immigration-policies",
        id: id!,
        data: { status: "published", internalNotes: "Bypass attempt" },
        user,
        overrideAccess: false,
      }),
    );
    await assert.rejects(() =>
      p.delete({ collection: "immigration-policies", id: id!, user, overrideAccess: false }),
    );
  }
  console.log("PASS generic mutations cannot bypass future review, including administrators");

  await p.update({
    collection: "immigration-policies",
    id,
    data: { countryNameEn: "Fictional draft", internalNotes: "Private fixture", revision: 2 },
    overrideAccess: true,
  });
  const versions = await p.findVersions({
    collection: "immigration-policies",
    where: { parent: { equals: id } },
    user: admin,
    overrideAccess: false,
    sort: "createdAt",
  });
  assert.ok(versions.docs.length >= 2);
  assert.ok(versions.docs.some((version) => version.version.revision === 1));
  assert.ok(versions.docs.some((version) => version.version.internalNotes === "Private fixture"));
  await assert.rejects(() =>
    p.restoreVersion({
      collection: "immigration-policies",
      id: String(versions.docs[0].id),
      user: admin,
      overrideAccess: false,
    }),
  );
  await assert.rejects(() =>
    p.create({
      collection: "immigration-policies",
      data: { policyKey: key, status: "draft", revision: 1 },
    }),
  );
  console.log("PASS immutable version history, restore denied and stable policy key unique");
} finally {
  if (id) {
    await p.delete({ collection: "immigration-policies", id, overrideAccess: true });
  }
  await p.destroy();
}
// Match the existing integration harness; errors above still propagate with a nonzero exit.
process.exit(0);
