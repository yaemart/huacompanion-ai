import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { emptyLifestyle, lifeTranslationFields } from "../../src/lib/lifestyle";
import { mutateContent, listPublished } from "../../src/server/content/service";
import { resolveCatalogSource } from "../../src/server/catalog/source";
import { saveIntake } from "../../src/server/intake";
import { agentAction } from "../../src/server/content-agent/service";
if (process.env.APP_ENV !== "local") throw Error("Local only");
const p = await getPayload({ config }),
  drafts: number[] = [];
const admin = (
  await p.find({
    collection: "staff",
    where: { and: [{ role: { equals: "admin" } }, { active: { not_equals: false } }] },
    sort: "createdAt",
    limit: 1,
  })
).docs[0];
const run = `life-test-${Date.now()}`;
try {
  const life = {
    ...emptyLifestyle("venue"),
    city: "shanghai",
    address: "Fictional test address",
    audience: "Fictional adults",
    booking: "Contact Hua",
    fees: "Confirm before booking",
    languageNotes: "Not confirmed",
    officialURL: "https://example.org/test",
    verifiedAt: "2026-10-01",
    assistance: "Booking coordination",
    hours: "Confirm hours",
  };
  const body = {
    kind: "venue" as const,
    locale: "en" as const,
    contentKey: run,
    slug: run,
    title: "Fictional test venue",
    summary: "Not a real recommendation",
    blocks: [{ type: "paragraph", text: "Fictional local test only" }],
    sources: [{ id: "s", title: "Test only", url: life.officialURL, checkedAt: life.verifiedAt }],
    lifestyle: life,
  };
  const save = async (b: any) => {
    const d = await mutateContent(p, admin, { action: "save", body: b });
    drafts.push(d.id);
    return d;
  };
  const submit = (d: any) =>
    mutateContent(p, admin, { action: "submit", id: d.id, revision: d.revision });
  const publish = (d: any, reviewed = true) =>
    mutateContent(p, admin, {
      action: "publish",
      id: d.id,
      revision: d.revision,
      lifeReviewed: reviewed,
      overrideReason: "Local fictional test review",
    });
  let d = await save({ ...body, lifestyle: { ...life, privateContact: "SECRET" } });
  assert.ok(!(await listPublished(p, "en")).some((x) => x.contentKey === run));
  d = await submit(d);
  await assert.rejects(() => publish(d, false));
  await assert.rejects(() =>
    mutateContent(
      p,
      { ...admin, role: "editor", additionalRoles: [], contentKinds: ["venue"] },
      { action: "publish", id: d.id, revision: d.revision, lifeReviewed: true },
    ),
  );
  d = await publish(d);
  const live = (await listPublished(p, "en")).find((x) => x.contentKey === run)!;
  assert.equal(live.acceptingInquiries, true);
  assert.ok(live.publicationRevision);
  assert.ok(!JSON.stringify(live).includes("SECRET"));
  assert.ok(!(await listPublished(p, "fr")).some((x) => x.contentKey === run));
  const resolved = await resolveCatalogSource(p, "en", { life: run, lifeKind: "venue" });
  assert.ok(resolved?.life);
  const input = {
    kind: "request",
    locale: "en",
    source: { life: run, lifeKind: "venue", lifeRevision: resolved!.life!.revision },
    values: {
      categories: ["travel"],
      city: "Shanghai",
      people: "2",
      datesUnknown: true,
      name: "Fictional life test",
      email: "life-test@example.invalid",
      language: "English",
      consent: true,
    },
  };
  await assert.rejects(() =>
    saveIntake({ ...input, source: { ...input.source, lifeRevision: 999999 } }, randomUUID()),
  );
  const receipt = await saveIntake(input, randomUUID());
  const inquiry = (
    await p.find({
      collection: "inquiries",
      where: { reference: { equals: receipt.reference } },
      limit: 1,
    })
  ).docs[0];
  assert.equal((inquiry.catalogSource as any).life.key, run);
  d = await mutateContent(p, admin, {
    action: "save",
    id: d.id,
    revision: d.revision,
    body: { ...body, title: "Updated conditions" },
  });
  d = await publish(await submit(d));
  if (process.env.AUTHZ_HTTP_URL) {
    const old = await fetch(
      process.env.AUTHZ_HTTP_URL +
        "/en/request?life=" +
        run +
        "&lifeKind=venue&lifeRevision=" +
        resolved!.life!.revision,
    );
    assert.ok((await old.text()).includes("This selection changed or is unavailable"));
    const current = (await resolveCatalogSource(p, "en", { life: run, lifeKind: "venue" }))!.life!;
    const fresh = await fetch(
      process.env.AUTHZ_HTTP_URL +
        "/en/request?life=" +
        run +
        "&lifeKind=venue&lifeRevision=" +
        current.revision,
    );
    assert.ok((await fresh.text()).includes("Updated conditions"));
  }
  d = await mutateContent(p, admin, {
    action: "save",
    id: d.id,
    revision: d.revision,
    body: { ...body, lifestyle: { ...life, status: "paused" } },
  });
  assert.equal(
    (await listPublished(p, "en")).find((x) => x.contentKey === run)!.acceptingInquiries,
    true,
  );
  d = await publish(await submit(d));
  await assert.rejects(() => saveIntake(input, randomUUID()));
  const activityBody = {
    ...body,
    contentKey: run + "-activity",
    slug: run + "-activity",
    kind: "activity",
    lifestyle: {
      ...life,
      status: "scheduled",
      startAt: "2099-01-01T10:00:00+08:00",
      endAt: "2099-01-01T12:00:00+08:00",
      organizer: "Test",
      participation: "Test only",
      refunds: "Confirm",
      venueKey: run,
    },
  };
  let a = await publish(await submit(await save(activityBody)));
  assert.equal(
    (await listPublished(p, "en")).find((x) => x.contentKey === run + "-activity")!
      .acceptingInquiries,
    true,
  );
  const actor = {
    ...admin,
    role: "editor" as const,
    additionalRoles: [],
    contentKinds: ["venue" as const],
  };
  await assert.rejects(() =>
    p.findByID({ collection: "content-drafts", id: a.id, user: actor, overrideAccess: false }),
  );
  await assert.rejects(() =>
    agentAction(p, actor, {
      action: "create",
      kind: "draft",
      title: "Forbidden",
      material: "Test",
      draftId: a.id,
      revision: a.revision,
    }),
  );
  const task = await agentAction(p, admin, {
    action: "create",
    kind: "translate",
    title: "Test translation",
    material: "Test",
    draftId: a.id,
    revision: a.revision,
    targetLocale: "fr",
  });
  await p.update({
    collection: "content-agent-tasks",
    id: task.id,
    data: {
      status: "succeeded",
      result: { title: "Incomplete", blocks: [], sourceIds: ["s"], questions: [] },
    },
  });
  await assert.rejects(
    () => agentAction(p, admin, { action: "adopt", id: task.id }),
    /结构化资料翻译不完整/,
  );
  await p.update({
    collection: "content-agent-tasks",
    id: task.id,
    data: {
      status: "succeeded",
      result: {
        title: "Activité fictive",
        blocks: [],
        sourceIds: ["s"],
        questions: [],
        lifestyleText: Object.fromEntries(
          lifeTranslationFields
            .filter((k) => activityBody.lifestyle[k])
            .map((k) => [k, "Texte traduit de test"]),
        ),
      },
    },
  });
  const translated = await agentAction(p, admin, { action: "adopt", id: task.id });
  const fr = (
    await p.find({
      collection: "content-drafts",
      where: {
        and: [{ contentKey: { equals: activityBody.contentKey } }, { locale: { equals: "fr" } }],
      },
      limit: 1,
    })
  ).docs[0];
  drafts.push(fr.id);
  assert.equal((fr.body as any).lifestyle.venueKey, run);
  assert.equal(fr.reviewState, "draft");
  assert.equal((fr.body as any).lifestyle.booking, "Texte traduit de test");
  assert.equal((fr.body as any).lifestyle.startAt, activityBody.lifestyle.startAt);
  a = await mutateContent(p, admin, {
    action: "save",
    id: a.id,
    revision: a.revision,
    body: { ...activityBody, lifestyle: { ...activityBody.lifestyle, status: "cancelled" } },
  });
  await publish(await submit(a));
  await assert.rejects(() =>
    resolveCatalogSource(p, "en", { life: run + "-activity", lifeKind: "activity" }),
  );
  if (process.env.AUTHZ_HTTP_URL) {
    const base = process.env.AUTHZ_HTTP_URL;
    const api = await fetch(base + "/api/public/life?locale=en&key=" + run + "&kind=venue");
    assert.equal(api.status, 200);
    const json = await api.json();
    assert.equal(json.items[0].inquiryPath, null);
    assert.ok(!JSON.stringify(json).includes("SECRET"));
    assert.equal((await fetch(base + "/api/public/life?city=invalid")).status, 400);
    assert.equal((await fetch(base + "/api/public/life?locale=fr&key=" + run)).status, 404);
    for (const locale of ["zh", "en", "es", "fr", "de", "it", "ar"]) {
      const page = await fetch(base + "/" + locale + "/life");
      assert.equal(page.status, 200);
      const html = await page.text();
      assert.ok(html.includes("/life"));
      if (locale === "ar") assert.ok(html.includes('dir="rtl"'));
    }
    assert.equal((await fetch(base + "/en/life/venue/" + run)).status, 200);
    console.log("PASS HTTP public content, seven locales and private-field exclusion");
  }
  console.log(
    "PASS life publication, independent boards, source revision, intake snapshots, cancellation and AI translation draft",
  );
} finally {
  if (drafts.length)
    await p.update({
      collection: "content-published",
      where: { draftId: { in: drafts } },
      data: { active: false },
    });
  await p.destroy();
}
process.exit(0);
