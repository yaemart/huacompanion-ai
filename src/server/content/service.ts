import { isCatalog, validateCatalog } from "../../lib/catalog";
import {
  eligibleProvider,
  allSnapshots,
  suspendProjectsForKey,
} from "../catalog/eligibility";
import type { Payload } from "payload";
import {
  canEditContent,
  validateContent,
  publicBody,
  type ContentBody,
  type ContentUser,
} from "../../lib/content-model";
export class ContentError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
// All content writes use this transaction lock; generic collection mutations are denied.
export async function contentTransaction<T>(
  p: Payload,
  run: (req: { transactionID: string | number }) => Promise<T>,
): Promise<T> {
  const id = await p.db.beginTransaction();
  if (!id) throw Error("Transaction required");
  try {
    const sessions = p.db.sessions as
      | Record<string, { db: { execute: (query: string) => Promise<unknown> } }>
      | undefined;
    if (!sessions?.[id]) throw Error("Transaction session missing");
    await sessions[id].db.execute("SELECT pg_advisory_xact_lock(726271)");
    const result = await run({ transactionID: id });
    await p.db.commitTransaction(id);
    return result;
  } catch (e) {
    await p.db.rollbackTransaction(id);
    throw e;
  }
}
export async function readPublished(
  p: Payload,
  kind: string,
  locale: string,
  slug: string,
) {
  return (
    (await listPublished(p, locale)).find(
      (d) => d.kind === kind && d.slug === slug,
    ) || null
  );
}
export async function listPublished(p: Payload, locale: string, req?: any) {
  const snapshots = await allSnapshots(p, req);
  const eligible = new Map<number, boolean>();
  for (const s of snapshots)
    if (
      (s.body as ContentBody).kind === "provider-profile" &&
      !eligible.has(s.providerRef)
    )
      eligible.set(
        s.providerRef,
        await eligibleProvider(p, s.providerRef, req),
      );
  const available = snapshots.filter(
    (s) =>
      (s.body as ContentBody).kind !== "provider-profile" ||
      eligible.get(s.providerRef),
  );
  const providerKeys = new Set(
    available
      .filter(
        (s) =>
          (s.body as ContentBody).kind === "provider-profile" &&
          (s.body as ContentBody).locale === locale,
      )
      .map((s) => (s.body as ContentBody).contentKey),
  );
  return available
    .filter((s) => (s.body as ContentBody).locale === locale)
    .map((s) => {
      const b = publicBody(s.body as ContentBody);
      if (isCatalog(b.kind)) {
        b.acceptingInquiries =
          b.kind === "provider-profile" ||
          (!s.suspended &&
            (b.catalog!.fulfillment === "arranged" ||
              b.catalog!.providerKeys.every((k) => providerKeys.has(k))));
        b.catalog!.providerKeys = b.catalog!.providerKeys.filter((k) =>
          providerKeys.has(k),
        );
      }
      return { ...b, publishedAt: s.publishedAt };
    })
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

export async function mutateContent(p: Payload, user: ContentUser, input: any) {
  if (!canEditContent(user)) throw new ContentError("无内容管理权限", 403);
  if (
    ["publish", "unpublish", "return"].includes(input.action) &&
    user?.role !== "admin"
  )
    throw new ContentError("只有管理员可审核发布", 403);
  const result = await contentTransaction(p, async (req) => {
    const current = input.id
      ? await p.findByID({
          collection: "content-drafts",
          id: Number(input.id),
          req,
          depth: 0,
        })
      : null;
    if (current && current.revision !== input.revision)
      throw new ContentError("内容已经更新，请刷新后重试", 409);
    let body = input.body;
    if (input.action === "restore") {
      if (!current) throw new ContentError("请选择内容");
      const versions = await p.findVersions({
        collection: "content-drafts",
        where: {
          and: [
            { parent: { equals: current.id } },
            { id: { equals: input.versionId } },
          ],
        },
        limit: 1,
        req,
      });
      if (!versions.docs[0]) throw new ContentError("历史版本不存在", 404);
      body = versions.docs[0].version.body;
    }
    if (["save", "restore"].includes(input.action)) {
      validateContent(body);
      body = publicBody(body);
      if (current) {
        const old = current.body as unknown as ContentBody;
        if (
          old.contentKey !== body.contentKey ||
          old.locale !== body.locale ||
          old.kind !== body.kind
        )
          throw new ContentError("内容类型、标识和语言不能修改");
        if (current.everPublished && old.slug !== body.slug)
          throw new ContentError("已发布的网址不能修改");
      }
      for (const block of body.blocks)
        if (block.type === "image")
          await p.findByID({
            collection: "content-media",
            id: block.mediaId!,
            req,
          });
      let providerRef = current?.providerRef;
      if (body.kind === "provider-profile" && input.providerRef !== undefined) {
        if (user?.role !== "admin")
          throw new ContentError("只有管理员可关联内部服务商", 403);
        if (
          input.providerRef !== null &&
          (!Number.isSafeInteger(input.providerRef) || input.providerRef < 1)
        )
          throw new ContentError("内部服务商编号无效");
        if (current?.everPublished && current.providerRef !== input.providerRef)
          throw new ContentError("已发布服务商的内部关联不能更改");
        providerRef = input.providerRef;
      }
      const data = {
        ...(body.kind === "provider-profile" ? { providerRef } : {}),
        title: body.title,
        contentKey: body.contentKey,
        locale: body.locale,
        kind: body.kind,
        slug: body.slug,
        identity: `${body.contentKey}:${body.locale}`,
        routeKey: `${body.kind}:${body.locale}:${body.slug}`,
        body,
        revision: (current?.revision || 0) + 1,
        reviewState: "draft" as const,
        reviewNote: "",
      };
      const saved = current
        ? await p.update({
            collection: "content-drafts",
            id: current.id,
            data,
            req,
          })
        : await p.create({ collection: "content-drafts", data, req });
      if (user?.role !== "admin") delete (saved as any).providerRef;
      return saved;
    }
    if (!current) throw new ContentError("内容不存在", 404);
    if (input.action === "submit")
      return p.update({
        collection: "content-drafts",
        id: current.id,
        data: {
          reviewState: "review",
          revision: current.revision + 1,
          reviewNote: "",
        },
        req,
      });
    if (input.action === "return")
      return p.update({
        collection: "content-drafts",
        id: current.id,
        data: {
          reviewState: "returned",
          reviewNote: String(input.note || "请修改后重新提交").slice(0, 2000),
          revision: current.revision + 1,
        },
        req,
      });
    if (!["publish", "unpublish"].includes(input.action))
      throw new ContentError("未知操作");
    const existing = (
      await p.find({
        collection: "content-published",
        where: { draftId: { equals: current.id } },
        limit: 1,
        req,
      })
    ).docs[0];
    const clean = publicBody(current.body as unknown as ContentBody);
    validateContent(clean);
    if (input.action === "publish") {
      if (current.reviewState !== "review")
        throw new ContentError("请先提交审核");
      if (!clean.blocks.length) throw new ContentError("正文不能为空");
      if (clean.kind === "guide" && !clean.sources.length)
        throw new ContentError("指南发布前需添加资料来源");
      if (isCatalog(clean.kind)) {
        validateCatalog(clean.kind, clean.catalog, true);
        if (input.catalogReviewed !== true)
          throw new ContentError(
            "请确认公开文字、图片与核验资料已检查，不含直联方式",
          );
        if (
          clean.kind === "provider-profile" &&
          !(await eligibleProvider(p, current.providerRef, req))
        )
          throw new ContentError("关联服务商必须已核实／签约并获准公开");
        if (
          clean.kind === "service-project" &&
          clean.catalog!.fulfillment === "specified"
        ) {
          const live = await listPublished(p, clean.locale, req);
          if (
            clean.catalog!.providerKeys.some(
              (k) =>
                !live.some(
                  (d) => d.kind === "provider-profile" && d.contentKey === k,
                ),
            )
          )
            throw new ContentError("指定服务商尚未发布或已暂停");
        }
      }
      const data = {
        providerRef:
          clean.kind === "provider-profile" ? current.providerRef : null,
        suspended: false,
        draftId: current.id,
        routeKey: current.routeKey,
        active: true,
        revision: current.revision,
        body: clean as any,
        publishedBy: Number(user!.id),
        publishedAt: new Date().toISOString(),
      };
      if (existing)
        await p.update({
          collection: "content-published",
          id: existing.id,
          data,
          req,
        });
      else await p.create({ collection: "content-published", data, req });
    } else if (existing)
      await p.update({
        collection: "content-published",
        id: existing.id,
        data: { active: false },
        req,
      });
    if (input.action === "unpublish" && clean.kind === "provider-profile")
      await suspendProjectsForKey(p, clean.contentKey, clean.locale, req);
    await p.create({
      collection: "content-events",
      data: {
        draftId: current.id,
        action: input.action,
        actor: Number(user!.id),
        revision: current.revision,
        snapshot: clean as any,
      },
      req,
    });
    return p.update({
      collection: "content-drafts",
      id: current.id,
      data: {
        reviewState: input.action === "publish" ? "approved" : "draft",
        everPublished: current.everPublished || input.action === "publish",
        revision: current.revision + 1,
      },
      req,
    });
  });
  if (user?.role !== "admin") delete (result as any).providerRef;
  return result;
}
