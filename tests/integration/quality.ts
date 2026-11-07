import "dotenv/config";
import assert from "node:assert/strict";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { mutateContent, readPublished } from "../../src/server/content/service";
import { qualityDesk, reviewQuality, runQualityReview } from "../../src/server/quality/service";
if (process.env.APP_ENV !== "local") throw Error("Local test database only");
const p: any = await getPayload({ config });
const key = `quality-${Date.now()}`;
const drafts: number[] = [];
const staffIDs: number[] = [];
const admin = (
  await p.find({
    collection: "staff",
    where: { and: [{ role: { equals: "admin" } }, { active: { not_equals: false } }] },
    limit: 1,
  })
).docs[0];
assert.ok(admin);
const body = {
  contentKey: key,
  slug: key,
  kind: "guide",
  locale: "zh",
  title: "Quality source",
  summary: "Summary",
  blocks: [{ type: "paragraph", text: "Original public text" }],
  sources: [{ id: "official", title: "Official source", url: "https://example.com" }],
};
const input = (revision: number, owner: number) => ({
  revision,
  owner,
  reason: "Manually checked the official source",
  sourceIds: ["official"],
  nextReviewAt: new Date(Date.now() + 86400000).toISOString(),
});
try {
  const reviewer = await p.create({
    collection: "staff",
    user: admin,
    data: {
      name: key,
      email: `${key}@example.invalid`,
      password: `${key}-Strong-password`,
      role: "reviewer",
      contentKinds: ["guide"],
      active: true,
    },
  });
  staffIDs.push(reviewer.id);
  const outsider = await p.create({
    collection: "staff",
    user: admin,
    data: {
      name: `${key}-outside`,
      email: `${key}-outside@example.invalid`,
      password: `${key}-Strong-password`,
      role: "reviewer",
      contentKinds: ["faq"],
      active: true,
    },
  });
  staffIDs.push(outsider.id);
  let source = await mutateContent(p, admin, { action: "save", body });
  drafts.push(source.id);
  let translation = await mutateContent(p, admin, {
    action: "save",
    body: { ...body, locale: "en", title: "Translation" },
  });
  drafts.push(translation.id);
  await p.update({
    collection: "content-drafts",
    id: translation.id,
    data: { sourceDraft: source.id, sourceRevision: source.revision },
  });
  await assert.rejects(() =>
    reviewQuality(p, outsider, source.id, input(source.revision, reviewer.id)),
  );
  await assert.rejects(() =>
    reviewQuality(p, reviewer, source.id, input(source.revision, outsider.id)),
  );
  await assert.rejects(() =>
    reviewQuality(p, reviewer, source.id, {
      ...input(source.revision, reviewer.id),
      sourceIds: ["fake"],
    }),
  );
  await assert.rejects(() => reviewQuality(p, reviewer, source.id, input(999, reviewer.id)));
  // A cached authenticated actor must not retain authority after DB revocation.
  await p.update({ collection: "staff", id: reviewer.id, user: admin, data: { active: false } });
  await assert.rejects(
    () => reviewQuality(p, reviewer, source.id, input(source.revision, admin.id)),
    /审核权限/,
  );
  await p.update({
    collection: "staff",
    id: reviewer.id,
    user: admin,
    data: { active: true, contentKinds: ["faq"] },
  });
  await assert.rejects(() =>
    reviewQuality(p, reviewer, source.id, input(source.revision, admin.id)),
  );
  await p.update({
    collection: "staff",
    id: reviewer.id,
    user: admin,
    data: { contentKinds: ["guide"] },
  });
  await reviewQuality(p, reviewer, source.id, input(source.revision, reviewer.id));
  await reviewQuality(p, reviewer, translation.id, input(translation.revision, reviewer.id));
  assert.equal(
    (await qualityDesk(p, outsider)).items.some((i: any) => drafts.includes(i.id)),
    false,
  );
  source = await mutateContent(p, admin, {
    action: "submit",
    id: source.id,
    revision: source.revision,
  });
  assert.equal(
    (await p.find({ collection: "content-quality", where: { draftId: { equals: source.id } } }))
      .docs[0].state,
    "checked",
  );
  source = await mutateContent(p, reviewer, {
    action: "publish",
    id: source.id,
    revision: source.revision,
  });
  const published = (
    await p.find({ collection: "content-published", where: { draftId: { equals: source.id } } })
  ).docs[0];
  const publicBefore = await readPublished(p, "guide", "zh", key);
  assert.ok(publicBefore?.qualityReview?.checkedAt);
  assert.deepEqual(Object.keys(publicBefore!.qualityReview!).sort(), ["checkedAt", "nextReviewAt"]);
  assert.equal(published.qualityReview.checkedRevision, published.revision);
  source = await mutateContent(p, admin, {
    action: "save",
    id: source.id,
    revision: source.revision,
    body: { ...body, title: "Changed source" },
  });
  const rows = (await p.find({ collection: "content-quality", where: { draftId: { in: drafts } } }))
    .docs;
  assert.equal(rows.find((r: any) => r.draftId === translation.id).state, "review-needed");
  assert.equal(rows.find((r: any) => r.draftId === source.id).state, "review-needed");
  assert.deepEqual(
    (await p.findByID({ collection: "content-published", id: published.id })).body,
    published.body,
  );
  assert.equal(
    (await p.findByID({ collection: "content-published", id: published.id })).active,
    true,
  );
  await reviewQuality(p, reviewer, source.id, input(source.revision, reviewer.id));
  assert.deepEqual(
    (await readPublished(p, "guide", "zh", key))?.qualityReview,
    publicBefore?.qualityReview,
  );
  assert.deepEqual(
    (await p.findByID({ collection: "content-published", id: published.id })).qualityReview,
    published.qualityReview,
  );
  // Keep the source due for reminder assertions after proving re-review isolation.
  await p.update({
    collection: "content-quality",
    where: { draftId: { equals: source.id } },
    data: { nextReviewAt: new Date(Date.now() - 60000).toISOString() },
  });
  await runQualityReview(p);
  await runQualityReview(p);
  const events = await p.find({
    collection: "workflow-events",
    where: { and: [{ contentDraft: { equals: source.id } }, { type: { equals: "quality-due" } }] },
  });
  assert.equal(events.docs.length, 1);
  const desk = await qualityDesk(p, reviewer);
  assert.equal(desk.items.find((i: any) => i.id === source.id).coverage.en, "review-needed");
  console.log(
    "PASS quality scope, owner eligibility, source validation, revision conflicts, translation invalidation, publication immutability, reminder deduplication",
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  for (const collection of [
    "workflow-mail-jobs",
    "workflow-notifications",
    "workflow-tasks",
    "workflow-events",
  ]) {
    if (collection === "workflow-mail-jobs") continue;
    await p.delete({ collection, where: { contentDraft: { in: drafts } } });
  }
  for (const collection of [
    "content-quality-events",
    "content-quality",
    "content-events",
    "content-published",
  ])
    await p.delete({ collection, where: { draftId: { in: drafts } } });
  for (const id of drafts) await p.delete({ collection: "content-drafts", id });
  for (const id of staffIDs) await p.delete({ collection: "staff", id, user: admin });
  await p.destroy();
  process.exit(process.exitCode || 0);
}
