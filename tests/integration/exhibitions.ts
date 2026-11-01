import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { emptyExhibition } from "../../src/lib/exhibitions";
import { emptyCatalog, parseCatalogSource, inquiryFormKey } from "../../src/lib/catalog";
import { mutateContent, listPublished } from "../../src/server/content/service";
import { resolveCatalogSource } from "../../src/server/catalog/source";
import { saveIntake } from "../../src/server/intake";
if (process.env.APP_ENV !== "local") throw Error("Local only");
const p = await getPayload({ config });
const drafts: number[] = [];
try {
  const admin = (
    await p.find({
      collection: "staff",
      where: { and: [{ role: { equals: "admin" } }, { active: { not_equals: false } }] },
      sort: "createdAt",
      limit: 1,
    })
  ).docs[0];
  assert.ok(admin, "Local admin required");
  const run = `exhibition-test-${Date.now()}`;
  const event = {
    ...emptyExhibition(),
    edition: "Integration fixture",
    city: "shanghai",
    venue: "Fictional test venue",
    address: "Fictional test address",
    startDate: "2090-01-30",
    endDate: "2090-02-02",
    audience: "Test buyers",
    exhibits: "Test hardware",
    admission: "Test registration only",
    officialURL: "https://example.org/test-event",
    verifiedAt: "2026-10-01",
    industries: ["hardware"],
    status: "announced" as const,
    projectKeys: [`${run}-project`],
  };
  const body = {
    kind: "exhibition",
    contentKey: run,
    slug: run,
    locale: "en",
    title: "Fictional integration exhibition",
    blocks: [{ type: "paragraph", text: "TEST ONLY - not a real exhibition" }],
    sources: [
      { id: "official", title: "Test source", url: event.officialURL, checkedAt: event.verifiedAt },
    ],
    exhibition: event,
  };
  async function save(body: any, id?: number) {
    const current = id ? await p.findByID({ collection: "content-drafts", id }) : undefined;
    const d = await mutateContent(p, admin, {
      action: "save",
      body,
      id,
      revision: current?.revision,
    });
    if (!id) drafts.push(d.id);
    return d;
  }
  async function submit(d: any) {
    return mutateContent(p, admin, { action: "submit", id: d.id, revision: d.revision });
  }
  async function publish(d: any, extra: any = { exhibitionReviewed: true, catalogReviewed: true }) {
    return mutateContent(p, admin, {
      action: "publish",
      overrideReason: "Local regression fixture review and cleanup",
      id: d.id,
      revision: d.revision,
      ...extra,
    });
  }
  async function source() {
    return (await resolveCatalogSource(p, "en", { exhibition: run }))!.exhibition!;
  }
  const values = {
    categories: ["business"],
    city: "Shanghai",
    people: "2",
    datesUnknown: true,
    name: "Fictional exhibition integration",
    email: "test@example.com",
    language: "English",
    consent: true,
  };
  const input = (revision: number, extra: any = {}) => ({
    kind: "request",
    locale: "en",
    source: { exhibition: run, exhibitionRevision: revision, ...extra },
    values,
  });
  let draft = await save({
    ...body,
    internalNote: "PRIVATE",
    exhibition: { ...event, internalNote: "PRIVATE" },
  });
  assert.equal(
    (await listPublished(p, "en")).some((d) => d.contentKey === run),
    false,
  );
  draft = await submit(draft);
  await assert.rejects(
    () =>
      mutateContent(
        p,
        { ...admin, role: "editor" },
        {
          action: "publish",
          overrideReason: "Local regression fixture review and cleanup",
          id: draft.id,
          revision: draft.revision,
          exhibitionReviewed: true,
        },
      ),
    /只有内容审核员/,
  );
  await assert.rejects(() => publish(draft, {}), /人工核验/);
  const missing = await submit(
    await save({ ...body, contentKey: `${run}-missing`, slug: `${run}-missing`, sources: [] }),
  );
  await assert.rejects(() => publish(missing), /资料来源/);
  draft = await publish(draft);
  const live = (await listPublished(p, "en")).find((d) => d.contentKey === run)!;
  assert.ok(live);
  assert.equal(live.acceptingInquiries, true);
  assert.ok(!JSON.stringify(live).includes("PRIVATE"));
  for (const locale of ["zh", "es", "fr", "de", "it", "ar"])
    assert.equal(
      (await listPublished(p, locale)).some((d) => d.contentKey === run),
      false,
    );
  const zh = await publish(
    await submit(await save({ ...body, locale: "zh", title: "虚构集成测试展会" })),
  );
  assert.equal(
    (await listPublished(p, "zh")).find((d) => d.contentKey === run)?.title,
    "虚构集成测试展会",
  );
  let current = await source();
  assert.throws(() => parseCatalogSource({ exhibition: run, exhibitionRevision: "2" }));
  assert.throws(() => parseCatalogSource({ exhibitionRevision: 2 }));
  assert.notEqual(
    inquiryFormKey("en", "business", { exhibition: run, exhibitionRevision: 1 }),
    inquiryFormKey("en", "business", { exhibition: run, exhibitionRevision: 2 }),
  );
  await assert.rejects(() =>
    saveIntake({ ...input(current.revision), source: { exhibition: run } }, randomUUID()),
  );
  await assert.rejects(() => saveIntake(input(current.revision + 100), randomUUID()));
  const key = randomUUID();
  const payload = {
    ...input(current.revision),
    catalogSource: { exhibition: { title: "FORGED", city: "beijing" } },
  };
  const receipt = await saveIntake(payload, key);
  const stored = (
    await p.find({
      collection: "inquiries",
      where: { reference: { equals: receipt.reference } },
      limit: 1,
    })
  ).docs[0].catalogSource as any;
  assert.equal(stored.exhibition.title, body.title);
  assert.equal(stored.exhibition.city, event.city);
  assert.equal(stored.exhibition.startDate, event.startDate);
  assert.equal(stored.exhibition.endDate, event.endDate);
  assert.equal(stored.exhibition.status, "announced");
  assert.equal(stored.exhibition.revision, current.revision);
  assert.equal((await saveIntake(payload, key)).duplicate, true);
  await assert.rejects(() => saveIntake(input(current.revision + 1), key));
  await assert.rejects(() =>
    saveIntake(input(current.revision, { provider: "missing" }), randomUUID()),
  );
  await assert.rejects(() =>
    saveIntake(input(current.revision, { project: `${run}-project` }), randomUUID()),
  );
  const catalog = {
    ...emptyCatalog(),
    categories: ["business"],
    cities: [{ code: "shanghai", name: "Shanghai" }],
    languages: ["en"],
    audience: "Buyers",
    includes: "Test",
    excludes: "Test",
    process: "Test",
    deliverables: "Test",
    materials: "Test",
    bookingNotice: "Test",
    duration: "Test",
    people: "Test",
    changes: "Test",
  };
  await publish(
    await submit(
      await save({
        ...body,
        kind: "service-project",
        contentKey: `${run}-project`,
        slug: `${run}-project`,
        catalog,
      }),
    ),
  );
  await publish(
    await submit(
      await save({
        ...body,
        kind: "service-project",
        contentKey: `${run}-other`,
        slug: `${run}-other`,
        catalog,
      }),
    ),
  );
  await saveIntake(input(current.revision, { project: `${run}-project` }), randomUUID());
  await assert.rejects(() =>
    saveIntake(input(current.revision, { project: `${run}-other` }), randomUUID()),
  );
  const oldRevision = current.revision;
  draft = await publish(
    await submit(await save({ ...body, exhibition: { ...event, city: "beijing" } }, draft.id)),
  );
  current = await source();
  assert.notEqual(current.revision, oldRevision);
  await assert.rejects(() => saveIntake(input(oldRevision), randomUUID()));
  await saveIntake(input(current.revision), randomUUID());
  draft = await publish(
    await submit(await save({ ...body, exhibition: { ...event, status: "cancelled" } }, draft.id)),
  );
  await assert.rejects(() => saveIntake(input(current.revision), randomUUID()));
  assert.equal(
    (await listPublished(p, "en")).find((d) => d.contentKey === run)?.acceptingInquiries,
    false,
  );
  draft = await publish(
    await submit(
      await save(
        { ...body, exhibition: { ...event, startDate: "2020-01-01", endDate: "2020-01-02" } },
        draft.id,
      ),
    ),
  );
  assert.equal(
    (await listPublished(p, "en")).find((d) => d.contentKey === run)?.exhibition?.status,
    "ended",
  );
  await assert.rejects(() => saveIntake(input(current.revision), randomUUID()));
  draft = await publish(await submit(await save(body, draft.id)));
  current = await source();
  await mutateContent(p, admin, {
    action: "unpublish",
    overrideReason: "Local regression fixture review and cleanup",
    id: draft.id,
    revision: draft.revision,
  });
  await assert.rejects(() => saveIntake(input(current.revision), randomUUID()));
  assert.ok(
    (await listPublished(p, "zh")).find((d) => d.contentKey === run),
    "English withdrawal preserves Chinese publication",
  );
  assert.equal(
    (await saveIntake(payload, key)).duplicate,
    true,
    "Already accepted retries remain idempotent after withdrawal",
  );
  console.log(
    "PASS exhibition permissions, privacy, locale isolation, publication/source checks, authoritative snapshots, revision, status, compatibility and idempotency",
  );
} finally {
  try {
    const admin = (
      await p.find({
        collection: "staff",
        where: { and: [{ role: { equals: "admin" } }, { active: { not_equals: false } }] },
        sort: "createdAt",
        limit: 1,
      })
    ).docs[0];
    const failures: unknown[] = [];
    for (const id of drafts)
      try {
        const d = await p.findByID({ collection: "content-drafts", id });
        await mutateContent(p, admin, {
          action: "unpublish",
          overrideReason: "Local regression fixture review and cleanup",
          id,
          revision: d.revision,
        });
      } catch (error) {
        failures.push(error);
      }
    if (failures.length) throw new AggregateError(failures, "Test fixture unpublish failed");
  } finally {
    await p.destroy();
  }
}

process.exit(0);
