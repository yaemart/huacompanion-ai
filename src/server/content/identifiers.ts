import { randomUUID } from "node:crypto";
import type { Payload, PayloadRequest, Where } from "payload";
import { contentKinds } from "../../cms/access";
import type { ContentBody } from "../../lib/content-model";
import {
  contentSlug,
  fixedContentPages,
  fixedPageKey,
  fixedSlugForKey,
  isContentIdentifier,
  numberedContentSlug,
} from "../../lib/content-identifiers";
import { ContentError } from "./error";

const isBlank = (value: unknown) => value === undefined || value === "";

export function initialContentIdentifiers(value: unknown) {
  const unchanged = { body: value, autoSlug: false, autoKey: false };
  if (!value || typeof value !== "object" || Array.isArray(value)) return unchanged;
  const record = value as Record<string, unknown>;
  const { kind, title } = record;
  if (
    !contentKinds.some((candidate) => candidate === kind) ||
    kind === "immigration-policy" ||
    typeof title !== "string" ||
    !title.trim() ||
    title.length > 200
  )
    return unchanged;

  if (kind === "page" && !fixedContentPages.some((page) => page.slug === record.slug))
    throw new ContentError("请选择要编辑的固定网站页面");
  const seed = randomUUID().replaceAll("-", "");
  const autoKey = isBlank(record.contentKey);
  const autoSlug = kind !== "page" && isBlank(record.slug);
  const contentKey = autoKey
    ? kind === "page"
      ? `page-${record.slug}`
      : `${kind}-${seed}`
    : record.contentKey;
  const slug = autoSlug ? contentSlug(title, `${kind}-${seed.slice(0, 8)}`) : record.slug;
  if (!isContentIdentifier(contentKey) || !isContentIdentifier(slug))
    throw new ContentError("高级区的标识只允许小写英文、数字和连字符，最多 100 个字符");
  return {
    body: { ...record, contentKey, slug },
    autoSlug,
    autoKey,
  };
}

/** Run only inside the existing content write transaction. */
export async function allocateContentIdentifiers(
  p: Payload,
  req: Partial<PayloadRequest>,
  body: ContentBody,
  { draftId, autoSlug, autoKey }: { draftId?: number; autoSlug?: boolean; autoKey?: boolean },
) {
  const { kind, locale, slug } = body;
  let { contentKey } = body;
  const candidates = autoSlug
    ? [slug, ...Array.from({ length: 49 }, (_, index) => numberedContentSlug(slug, index + 2))]
    : [slug];
  // /services/projects is the separate service project directory.
  const routes = candidates.filter((candidate) => kind !== "service" || candidate !== "projects");
  const key = (candidate: string) => `${kind}:${locale}:${candidate}`;
  if (!routes.length) throw new ContentError("网址标识已被目录使用，请在高级区更换", 409);
  const where = { routeKey: { in: routes.map(key) } };
  const base = { req, depth: 0, limit: routes.length, select: { routeKey: true } } as const;
  const drafts = await p.find({
    ...base,
    collection: "content-drafts",
    where: { ...where, ...(draftId ? { id: { not_equals: draftId } } : {}) },
  });
  const published = await p.find({
    ...base,
    collection: "content-published",
    where: { ...where, ...(draftId ? { draftId: { not_equals: draftId } } : {}) },
  });
  const used = new Set([...drafts.docs, ...published.docs].map((doc) => doc.routeKey));
  const available = routes.find((candidate) => !used.has(key(candidate)));
  if (!available)
    throw new ContentError(
      kind === "page" ? "该语言的网站页面已存在，请打开原稿编辑" : "网址标识已占用，请在高级区更换",
      409,
    );
  if (kind === "page") {
    if (!draftId && autoKey) {
      const { docs } = await p.find({
        collection: "content-drafts",
        where: { kind: { equals: "page" }, slug: { equals: available } },
        req,
        depth: 0,
        limit: 8,
        select: { contentKey: true },
      });
      const preferred = fixedPageKey(
        available,
        docs.map((doc) => doc.contentKey),
      );
      if (!preferred)
        throw new ContentError("同一页面已有多个内容标识，请在高级区指定要沿用的标识", 409);
      contentKey = preferred;
    }
    const fixedSlug = fixedSlugForKey(contentKey);
    if (fixedSlug && fixedSlug !== available)
      throw new ContentError("固定页面的内容标识与所选页面不一致，请打开原稿或新建对应页面", 409);
    const otherSlot = await p.find({
      collection: "content-drafts",
      where: {
        kind: { equals: "page" },
        contentKey: { equals: contentKey },
        slug: { not_equals: available },
        ...(draftId ? { id: { not_equals: draftId } } : {}),
      },
      req,
      depth: 0,
      limit: 1,
      select: { identity: true },
    });
    if (otherSlot.docs.length) throw new ContentError("该内容标识已关联其他固定页面", 409);
  }
  if (!draftId) {
    const conflicts: Where[] = [{ identity: { equals: `${contentKey}:${locale}` } }];
    if (autoKey && kind !== "page") conflicts.push({ contentKey: { equals: contentKey } });
    const existing = await p.find({
      collection: "content-drafts",
      where: { or: conflicts },
      req,
      depth: 0,
      limit: 1,
      select: { identity: true },
    });
    if (existing.docs.length) throw new ContentError("内容标识已占用，请在高级区更换", 409);
  }
  return { slug: available, contentKey };
}
