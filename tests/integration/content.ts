import "dotenv/config";
import assert from "node:assert/strict";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { versionOf } from "../../src/cms/quality/hooks";
import { mutateContent, readPublished, listPublished } from "../../src/server/content/service";
if (process.env.APP_ENV !== "local") throw Error("Local tests only");
const seenPages: number[] = [];
const paginated = await listPublished(
  {
    find: async ({ page }: { page: number }) => {
      seenPages.push(page);
      return {
        docs: [
          {
            body: {
              contentKey: String(page),
              kind: "guide",
              locale: "en",
              slug: String(page),
              title: "Page",
              blocks: [],
              sources: [],
            },
            publishedAt: "2026-10-27",
          },
        ],
        hasNextPage: page < 2,
      };
    },
  } as any,
  "en",
);
assert.deepEqual(seenPages, [1, 2]);
assert.equal(paginated.length, 2);
const p = await getPayload({ config });
const admin = (
  await p.find({
    collection: "staff",
    where: { and: [{ role: { equals: "admin" } }, { active: { not_equals: false } }] },
    sort: "createdAt",
    limit: 1,
  })
).docs[0];
const editor = { ...admin, role: "editor" as const, additionalRoles: [], contentKinds: ["guide"] };
const key = `test-${Date.now()}`;
const body = {
  contentKey: key,
  slug: key,
  kind: "guide",
  locale: "en",
  title: "Version one",
  blocks: [{ type: "paragraph", text: "Public body" }],
  sources: [{ id: "s", title: "Test source", url: "https://example.com" }],
};
try {
  const d = await mutateContent(p, admin, { action: "save", body });
  await assert.rejects(() =>
    mutateContent(p, editor, {
      action: "publish",
      overrideReason: "Local regression fixture review and cleanup",
      id: d.id,
      revision: d.revision,
    }),
  );
  await assert.rejects(() =>
    p.update({
      collection: "content-drafts",
      id: d.id,
      user: editor,
      overrideAccess: false,
      data: { reviewState: "approved" },
    }),
  );
  assert.equal(await readPublished(p, "guide", "en", key), null);
  const review = await mutateContent(p, editor, {
    action: "submit",
    id: d.id,
    revision: d.revision,
  });
  await mutateContent(p, admin, {
    action: "publish",
    overrideReason: "Local regression fixture review and cleanup",
    id: d.id,
    revision: review.revision,
  });
  assert.equal((await readPublished(p, "guide", "en", key))?.title, "Version one");
  const latest = await p.findByID({ collection: "content-drafts", id: d.id });
  const changed = await mutateContent(p, editor, {
    action: "save",
    id: d.id,
    revision: latest.revision,
    body: { ...body, title: "Version two" },
  });
  assert.equal((await readPublished(p, "guide", "en", key))?.title, "Version one");
  await assert.rejects(() =>
    mutateContent(p, admin, {
      action: "publish",
      overrideReason: "Local regression fixture review and cleanup",
      id: d.id,
      revision: latest.revision,
    }),
  );
  await assert.rejects(() =>
    mutateContent(p, admin, {
      action: "save",
      id: d.id,
      revision: changed.revision,
      body: { ...body, slug: "changed" },
    }),
  );
  const history = () =>
    p.findVersions({
      collection: "content-drafts",
      where: { parent: { equals: d.id } },
      limit: 30,
    });
  const historyBefore = (await history()).docs.map(({ id }) => id);
  const autosaved = await mutateContent(p, editor, {
    action: "save",
    autosave: true,
    id: d.id,
    revision: changed.revision,
    body: { ...body, title: "Version two", summary: "Background edit" },
  });
  assert.equal(autosaved.revision, changed.revision + 1);
  assert.equal(autosaved.reviewState, "draft");
  assert.equal(autosaved.lastEditedBy, editor.id);
  assert.equal(
    (await p.findByID({ collection: "content-drafts", id: d.id })).revision,
    autosaved.revision,
  );
  assert.deepEqual(
    (await history()).docs.map(({ id }) => id),
    historyBefore,
  );
  const quality = await p.find({
    collection: "content-quality",
    where: { draftId: { equals: d.id } },
  });
  assert.equal(quality.docs[0].contentVersion, versionOf(autosaved.body));
  assert.equal(quality.docs[0].state, "review-needed");
  assert.equal((await readPublished(p, "guide", "en", key))?.summary, "");
  const reviewed = await mutateContent(p, editor, {
    action: "submit",
    id: d.id,
    revision: autosaved.revision,
  });
  await assert.rejects(
    () =>
      mutateContent(p, editor, {
        action: "save",
        autosave: true,
        id: d.id,
        revision: reviewed.revision,
        body: { ...body, title: "Rejected while in review" },
      }),
    /待审核/,
  );
  await mutateContent(p, admin, {
    action: "publish",
    overrideReason: "Local regression fixture review and cleanup",
    id: d.id,
    revision: reviewed.revision,
  });
  assert.equal((await readPublished(p, "guide", "en", key))?.title, "Version two");
  assert.equal(await readPublished(p, "guide", "zh", key), null);
  const fresh = await p.findByID({ collection: "content-drafts", id: d.id });
  await mutateContent(p, admin, {
    action: "unpublish",
    overrideReason: "Local regression fixture review and cleanup",
    id: d.id,
    revision: fresh.revision,
  });
  assert.equal(await readPublished(p, "guide", "en", key), null);
  const last = await p.findByID({ collection: "content-drafts", id: d.id });
  const versions = await p.findVersions({
    collection: "content-drafts",
    where: { parent: { equals: d.id } },
    sort: "createdAt",
    limit: 30,
  });
  const restored = await mutateContent(p, admin, {
    action: "restore",
    id: d.id,
    revision: last.revision,
    versionId: versions.docs[0].id,
  });
  assert.equal(restored.reviewState, "draft");
  assert.equal(await readPublished(p, "guide", "en", key), null);
  const writes = await Promise.allSettled([
    mutateContent(p, editor, {
      action: "save",
      id: d.id,
      revision: restored.revision,
      autosave: true,
      body: { ...body, title: "Concurrent A" },
    }),
    mutateContent(p, editor, {
      action: "save",
      id: d.id,
      revision: restored.revision,
      body: { ...body, title: "Concurrent B" },
    }),
  ]);
  assert.equal(writes.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(writes.filter((r) => r.status === "rejected").length, 1);
  await assert.rejects(() =>
    p.find({ collection: "content-drafts", overrideAccess: false, user: null }),
  );
  console.log(
    "PASS content autosave, revision conflicts, audit history, pending lock, roles, publication and language isolation",
  );
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await p.destroy();
  process.exit(process.exitCode || 0);
}
