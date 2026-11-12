import type { Payload, PayloadRequest } from "payload";
import { canAccessContentKind } from "../../cms/access";
import { canEditContent, type ContentBody, type ContentUser } from "../../lib/content-model";
import { guideTargetLocale, type GuideTranslation } from "../../lib/guide-translation";
import { ContentError } from "./error";

export async function readGuideTranslation(
  p: Payload,
  user: ContentUser,
  id: number,
  req?: Partial<PayloadRequest>,
): Promise<GuideTranslation> {
  if (!canEditContent(user) || !canAccessContentKind(user, "guide"))
    throw new ContentError("无指南编辑权限", 403);
  if (!Number.isSafeInteger(id) || id < 1) throw new ContentError("原稿编号无效");
  const read = {
    collection: "content-drafts" as const,
    depth: 0,
    limit: 1,
    overrideAccess: false,
    user,
    req,
  };
  const [source] = (
    await p.find({ ...read, where: { id: { equals: id }, kind: { equals: "guide" } } })
  ).docs;
  const locale = source && guideTargetLocale(source.locale);
  if (!locale) throw new ContentError("找不到可对照的中英文指南", 404);
  const [target] = (
    await p.find({
      ...read,
      where: { kind: { equals: "guide" }, identity: { equals: `${source.contentKey}:${locale}` } },
    })
  ).docs;
  return { source, target: target ?? null, locale };
}

export async function prepareGuideTranslation(
  p: Payload,
  user: ContentUser,
  reference: unknown,
  body: unknown,
  req: Partial<PayloadRequest>,
) {
  if (
    !reference ||
    typeof reference !== "object" ||
    !("id" in reference) ||
    typeof reference.id !== "number" ||
    !("revision" in reference)
  )
    throw new ContentError("原稿资料无效");
  const { source, target, locale } = await readGuideTranslation(p, user, reference.id, req);
  if (target) throw new ContentError("此语言已存在工作稿，请打开已有译文。", 409);
  const occupied = await p.count({
    collection: "content-drafts",
    where: { identity: { equals: `${source.contentKey}:${locale}` } },
    req,
  });
  if (occupied.totalDocs) throw new ContentError("此语言的内容标识已被占用，请联系管理员。", 409);
  if (source.revision !== reference.revision)
    throw new ContentError("原稿已更新，请读取最新原文并核对后再保存。", 409);
  if (
    !body ||
    typeof body !== "object" ||
    !("kind" in body) ||
    body.kind !== "guide" ||
    !("locale" in body) ||
    body.locale !== locale
  )
    throw new ContentError("译文的类型或语言与原稿不匹配");
  const sourceTopic = (source.body as ContentBody).sourceTopic;
  const selectedTopic = "sourceTopic" in body ? body.sourceTopic : undefined;
  return {
    body: {
      ...body,
      sourceTopic: selectedTopic === undefined ? sourceTopic : selectedTopic,
      contentKey: source.contentKey,
      slug: "",
    },
    lineage: { sourceDraft: source.id, sourceRevision: source.revision },
  };
}
