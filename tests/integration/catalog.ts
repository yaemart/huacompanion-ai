import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { emptyCatalog } from "../../src/lib/catalog";
import { mutateContent, listPublished } from "../../src/server/content/service";
import { saveIntake } from "../../src/server/intake";
if (process.env.APP_ENV !== "local") throw Error("Local only");
const p = await getPayload({ config });
const admin = (
  await p.find({
    collection: "staff",
    where: { and: [{ role: { equals: "admin" } }, { active: { not_equals: false } }] }, sort: "createdAt",
    limit: 1,
  })
).docs[0];
const run = "catalog-" + Date.now();
const provider = await p.create({
  collection: "providers",
  data: {
    reference: run,
    name: "Fictional test",
    email: "test@example.com",
    organisation: "Fictional catalog test",
    phone: "not public",
    city: "Shanghai",
    categories: ["business"],
    languages: "en",
    capabilities: "test only",
    details: {},
    source: "website",
    locale: "en",
    consentAt: new Date().toISOString(),
    privacyVersion: "test",
    requestKey: run,
    contentHash: run,
    status: "applied",
    publicApproved: false,
  },
});
const base = {
  ...emptyCatalog(),
  categories: ["business"],
  cities: [{ code: "shanghai", name: "Shanghai" }],
  languages: ["en"],
  capabilities: "Fictional capabilities",
};
const providerBody = {
  kind: "provider-profile",
  contentKey: run,
  slug: run,
  locale: "en",
  title: "Fictional provider",
  blocks: [{ type: "paragraph", text: "Test only" }],
  sources: [],
  catalog: base,
};
const projectBody = {
  ...providerBody,
  kind: "service-project",
  contentKey: run + "-project",
  slug: run + "-project",
  title: "Fictional project",
  catalog: {
    ...base,
    audience: "Buyers",
    includes: "Accompaniment",
    excludes: "Transport",
    process: "Scope confirmation",
    deliverables: "Notes",
    materials: "Agenda",
    bookingNotice: "By confirmation",
    duration: "By proposal",
    people: "By proposal",
    changes: "Confirm in proposal",
    fulfillment: "specified",
    providerKeys: [run],
  },
};
const drafts: number[] = [];
async function reviewed(body: any, providerRef?: number) {
  const d = await mutateContent(p, admin, {
    action: "save",
    body,
    providerRef,
  });
  drafts.push(d.id);
  return mutateContent(p, admin, {
    action: "submit",
    id: d.id,
    revision: d.revision,
  });
}
async function publish(d: any) {
  return mutateContent(p, admin, {
    action: "publish", overrideReason:"Local regression fixture review and cleanup",
    id: d.id,
    revision: d.revision,
    catalogReviewed: true,
  });
}
try {
  let d = await reviewed(providerBody, provider.id);
  await assert.rejects(() => publish(d));
  await p.update({
    collection: "providers",
    id: provider.id,
    data: { status: "verified", publicApproved: true },
  });
  d = await publish(d);
  let project = await publish(await reviewed(projectBody));
  let live = await listPublished(p, "en");
  assert.equal(
    live.find((x) => x.contentKey === run + "-project")?.acceptingInquiries,
    true,
  );
  assert.equal(
    (live.find((x) => x.contentKey === run) as any).providerRef,
    undefined,
  );
  assert.ok(!JSON.stringify(live).includes("not public"));
  assert.equal(
    (await listPublished(p, "zh")).some((x) => x.contentKey === run),
    false,
  );
  const input = {
    kind: "request",
    locale: "en",
    source: { provider: run, project: run + "-project" },
    values: {
      categories: ["business"],
      city: "Shanghai",
      people: "2",
      datesUnknown: true,
      name: "Catalog test",
      email: "test@example.com",
      language: "English",
      consent: true,
    },
  };
  const key = randomUUID();
  const receipt = await saveIntake(input, key);
  const saved = (
    await p.find({
      collection: "inquiries",
      where: { reference: { equals: receipt.reference } },
      limit: 1,
    })
  ).docs[0];
  assert.equal((saved.catalogSource as any)?.provider?.key, run);
  assert.equal((saved.catalogSource as any)?.project?.key, run + "-project");
  assert.equal(
    (saved.catalogSource as any)?.provider?.providerRef,
    provider.id,
  );
  assert.ok(Number.isInteger((saved.catalogSource as any)?.project?.revision));
  assert.equal(
    (saved.catalogSource as any)?.project?.requiredProviders[0]?.providerRef,
    provider.id,
  );
  assert.equal((await saveIntake(input, key)).duplicate, true);
  await assert.rejects(() =>
    saveIntake({ ...input, source: { provider: run } }, key),
  );
  await assert.rejects(() =>
    saveIntake({ ...input, source: { project: "missing" } }, randomUUID()),
  );
  await p.update({
    collection: "providers",
    id: provider.id,
    data: { status: "paused", publicApproved: false },
  });
  live = await listPublished(p, "en");
  assert.equal(
    live.some((x) => x.contentKey === run),
    false,
  );
  assert.equal(
    live.find((x) => x.contentKey === run + "-project")?.acceptingInquiries,
    false,
  );
  await assert.rejects(() => saveIntake(input, randomUUID()));
  await p.update({
    collection: "providers",
    id: provider.id,
    data: { status: "verified", publicApproved: true },
  });
  assert.equal(
    (await listPublished(p, "en")).find(
      (x) => x.contentKey === run + "-project",
    )?.acceptingInquiries,
    false,
  );
  project = await mutateContent(p, admin, {
    action: "submit",
    id: project.id,
    revision: project.revision,
  });
  await publish(project);
  assert.equal(
    (await listPublished(p, "en")).find(
      (x) => x.contentKey === run + "-project",
    )?.acceptingInquiries,
    true,
  );
  await publish(await reviewed({ ...providerBody, locale: "zh" }, provider.id));
  await publish(await reviewed({ ...projectBody, locale: "zh" }));
  await mutateContent(p, admin, {
    action: "unpublish", overrideReason:"Local regression fixture review and cleanup",
    id: d.id,
    revision: d.revision,
  });
  assert.equal(
    (await listPublished(p, "zh")).find(
      (x) => x.contentKey === run + "-project",
    )?.acceptingInquiries,
    true,
    "English withdrawal must preserve Chinese publication",
  );
  d = await p.findByID({ collection: "content-drafts", id: d.id });
  d = await mutateContent(p, admin, {
    action: "submit",
    id: d.id,
    revision: d.revision,
  });
  await publish(d);
  assert.equal(
    (await listPublished(p, "en")).find(
      (x) => x.contentKey === run + "-project",
    )?.acceptingInquiries,
    false,
    "Unpublishing a required provider must latch project suspension",
  );
  console.log(
    "PASS catalog private projection, permission gate, source validation, retries and persistent suspension",
  );
} finally {
  for (const id of drafts) {
    const d = await p.findByID({ collection: "content-drafts", id });
    await mutateContent(p, admin, {
      action: "unpublish", overrideReason:"Local regression fixture review and cleanup",
      id,
      revision: d.revision,
    });
  }
  await p.update({
    collection: "providers",
    id: provider.id,
    data: { status: "paused", publicApproved: false },
  });
  await p.destroy();
}

process.exit(0);
