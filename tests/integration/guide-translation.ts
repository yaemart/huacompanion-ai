import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPayload } from "payload";
import config from "../../src/payload.config";
import { prefillGuideTranslation } from "../../src/lib/guide-translation";
import { readGuideTranslation } from "../../src/server/content/guide-translation";
import { ContentError, mutateContent } from "../../src/server/content/service";

const url = new URL(process.env.DATABASE_URL || "");
assert.equal(process.env.APP_ENV, "local");
assert.equal(url.hostname, "127.0.0.1");
assert.ok(
  (url.port === "55442" && /^\/hua_bilingual_editor_[a-f0-9]{32}$/.test(url.pathname)) ||
    (url.port === "55438" && url.pathname === "/hua_companion" && process.env.CI === "true"),
);
const p = await getPayload({ config });
try {
  const admin = (
    await p.find({ collection: "staff", where: { role: { equals: "admin" } }, limit: 1 })
  ).docs[0];
  assert.ok(admin);
  const editor = {
    ...admin,
    role: "editor" as const,
    additionalRoles: ["reviewer" as const],
    contentKinds: ["guide"],
  };
  const scoped = { ...editor, contentKinds: ["exhibition"] };
  const reviewer = { ...editor, role: "reviewer" as const, additionalRoles: [] };
  const key = `guide-bilingual-${randomUUID().slice(0, 8)}`;
  const original = {
    kind: "guide",
    locale: "zh",
    contentKey: key,
    slug: key,
    title: "虚构：中文版",
    category: 2,
    order: 5,
    blocks: [{ type: "paragraph", text: "原文" }],
    sources: [{ id: "ref", title: "资料", url: "https://example.org/", checkedAt: "2026-11-11" }],
  };
  const source = await mutateContent(p, editor, { action: "save", body: original });
  const view = await readGuideTranslation(p, editor, source.id);
  assert.equal(view.locale, "en");
  assert.equal(view.target, null);
  const denied = (e: unknown) => e instanceof ContentError && e.status === 403;
  const conflict = (e: unknown) => e instanceof ContentError && e.status === 409;
  await assert.rejects(readGuideTranslation(p, scoped, source.id), denied);
  await assert.rejects(readGuideTranslation(p, reviewer, source.id), denied);
  const body = {
    ...prefillGuideTranslation(view.source, view.locale),
    title: `Arrival guide ${key}`,
    blocks: [{ type: "paragraph", text: "English version" }],
  };
  const input = { action: "save", body, guideSource: { id: source.id, revision: source.revision } };
  await assert.rejects(mutateContent(p, scoped, input), denied);
  await assert.rejects(mutateContent(p, reviewer, input), denied);
  await assert.rejects(mutateContent(p, editor, { ...input, body: { ...body, locale: "zh" } }));
  await assert.rejects(mutateContent(p, editor, { ...input, body: { ...body, kind: "service" } }));
  const updated = await mutateContent(p, editor, {
    action: "save",
    id: source.id,
    revision: source.revision,
    body: { ...original, title: "虚构：更新的原文" },
  });
  await assert.rejects(mutateContent(p, editor, input), conflict);
  const fresh = {
    ...input,
    body: { ...body, contentKey: "forged", slug: "forged" },
    guideSource: { id: source.id, revision: updated.revision },
  };
  const [first, second] = await Promise.allSettled([
    mutateContent(p, editor, fresh),
    mutateContent(p, editor, fresh),
  ]);
  const created = [first, second].find((result) => result.status === "fulfilled");
  const duplicate = [first, second].find((result) => result.status === "rejected");
  assert.ok(created && duplicate && conflict(duplicate.reason));
  const target = created.value;
  assert.equal(target.contentKey, source.contentKey);
  assert.match(target.slug, /^arrival-guide-/);
  assert.equal(target.sourceDraft, source.id);
  assert.equal(target.sourceRevision, updated.revision);
  assert.deepEqual((await readGuideTranslation(p, editor, source.id)).target?.body, target.body);
  assert.equal((await readGuideTranslation(p, editor, target.id)).target?.id, source.id);
  await assert.rejects(
    mutateContent(p, editor, { ...fresh, id: target.id, revision: target.revision }),
  );
  const pending = await mutateContent(p, editor, {
    action: "submit",
    id: target.id,
    revision: target.revision,
  });
  await assert.rejects(
    mutateContent(p, editor, {
      action: "save",
      id: target.id,
      revision: pending.revision,
      body: target.body,
    }),
    conflict,
  );
  await assert.rejects(
    mutateContent(p, editor, { action: "publish", id: target.id, revision: pending.revision }),
    denied,
  );
  const untouched = await p.findByID({ collection: "content-drafts", id: source.id });
  assert.equal(untouched.revision, updated.revision);
  assert.equal(untouched.reviewState, "draft");
  assert.deepEqual(untouched.body, updated.body);
  assert.equal(pending.reviewState, "review");
  const occupiedBody = { ...original, contentKey: key + "-occupied", slug: key + "-occupied" };
  const occupiedSource = await mutateContent(p, editor, { action: "save", body: occupiedBody });
  await mutateContent(p, admin, {
    action: "save",
    body: { ...occupiedBody, kind: "faq", locale: "en" },
  });
  assert.equal((await readGuideTranslation(p, editor, occupiedSource.id)).target, null);
  await assert.rejects(
    mutateContent(p, editor, {
      ...fresh,
      guideSource: { id: occupiedSource.id, revision: occupiedSource.revision },
    }),
    /内容标识已被占用，请联系管理员/,
  );
  console.log(
    "PASS guide pairing, scopes, revision conflicts, duplicate races and independent review",
  );
} finally {
  await p.destroy();
}
process.exit(0);
