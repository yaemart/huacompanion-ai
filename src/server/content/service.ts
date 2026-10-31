import {versionOf} from '../../cms/quality/hooks';
import {publicQualityMetadata} from '../../lib/quality';
import {houseProviderCovers} from '../../lib/housekeeping';
import { canManageContent, canReviewContent, canAccessContentKind, isAdmin } from "../../cms/access";
import { isLife, lifeCanEnquire, validateLifePublication } from "../../lib/lifestyle";
import { validateInstitutionPublication } from "../../lib/institutions";
import { validateExhibitionPublication, effectiveExhibitionStatus } from "../../lib/exhibitions";
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
  const eligible = new Map<string, boolean>();
  for (const s of snapshots)
    if (
      (s.body as ContentBody).kind === "provider-profile" &&
      !eligible.has(`${s.providerRef}:${!!s.body.catalog?.categories.includes("housekeeping")}`)
    )
      eligible.set(
        `${s.providerRef}:${!!s.body.catalog?.categories.includes("housekeeping")}`,
        await eligibleProvider(p, s.providerRef, req, s.body.catalog?.categories.includes("housekeeping")),
      );
  const available = snapshots.filter(
    (s) =>
      (s.body as ContentBody).kind !== "provider-profile" ||
      eligible.get(`${s.providerRef}:${!!s.body.catalog?.categories.includes("housekeeping")}`),
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
      if (b.kind === "exhibition" && b.exhibition) {
        b.exhibition.status = effectiveExhibitionStatus(b.exhibition);
        b.acceptingInquiries = !["ended", "cancelled"].includes(b.exhibition.status);
      }
      if (isLife(b.kind) && b.lifestyle) b.acceptingInquiries = lifeCanEnquire(b.lifestyle,b.kind);
      if (b.kind === "institution" && b.institution) b.acceptingInquiries = b.institution.foreignAcceptance === "confirmed";
      if (isCatalog(b.kind)) {
        b.acceptingInquiries =
          b.kind === "provider-profile" ||
          (!s.suspended &&
            (b.catalog!.fulfillment === "arranged" ||
              b.catalog!.providerKeys.every((k) => providerKeys.has(k) && (!b.catalog!.categories.includes("housekeeping") || available.some(x=>x.body.kind==="provider-profile" && x.body.locale===locale && x.body.contentKey===k && houseProviderCovers(b.catalog!.housekeeping,x.body.catalog?.housekeeping))))));
        b.catalog!.providerKeys = b.catalog!.providerKeys.filter((k) =>
          providerKeys.has(k),
        );
      }
      return { ...b, publicationRevision:s.revision, publishedAt: s.publishedAt, qualityReview:publicQualityMetadata((s as any).qualityReview,s.revision) };
    })
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

export async function mutateContent(p: Payload, user: ContentUser, input: any) {
  if (!canManageContent(user)) throw new ContentError("无内容管理权限", 403);
  if (["save", "restore", "submit"].includes(input.action) && !canEditContent(user))
    throw new ContentError("只有内容编辑可修改或提交工作稿", 403);
  if (
    ["publish", "unpublish", "return"].includes(input.action) &&
    !canReviewContent(user)
  )
    throw new ContentError("只有内容审核员可审核发布", 403);
  const result = await contentTransaction(p, async (req) => {
    const current = input.id
      ? await p.findByID({
          collection: "content-drafts",
          id: Number(input.id),
          req,
          depth: 0,
        })
      : null;
    if (current && !canAccessContentKind(user, current.kind))
      throw new ContentError("无此板块权限", 403);
    if (current?.reviewState === "review" && ["save", "restore", "submit"].includes(input.action))
      throw new ContentError("待审核内容须先退回后才能修改", 409);
    const selfReview = current && [...(Array.isArray(current.contributors) ? current.contributors : []), current.lastEditedBy, current.submittedBy].some(id => id != null && String(id) === String(user!.id));
    const overrideReason = String(input.overrideReason || "").trim().slice(0, 2000);
    if (selfReview && ["publish", "return", "unpublish"].includes(input.action) && (!isAdmin(user) || !overrideReason))
      throw new ContentError("不能审核自己编辑或提交的内容；管理员须填写例外原因", 403);
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
      if (!canAccessContentKind(user, body.kind)) throw new ContentError("无此板块权限", 403);
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
            overrideAccess: false,
            user: user as any,
            req,
          });
      let providerRef = current?.providerRef;
      if (["provider-profile", "institution", "venue", "activity"].includes(body.kind) && input.providerRef !== undefined) {
        if (!isAdmin(user))
          throw new ContentError("只有管理员可关联内部服务商", 403);
        if (
          input.providerRef !== null &&
          (!Number.isSafeInteger(input.providerRef) || input.providerRef < 1)
        )
          throw new ContentError("内部服务商编号无效");
        if (body.kind === "provider-profile" && current?.everPublished && current.providerRef !== input.providerRef)
          throw new ContentError("已发布服务商的内部关联不能更改");
        if (input.providerRef !== null)
          await p.findByID({ collection: "providers", id: input.providerRef, req, depth: 0 });
        providerRef = input.providerRef;
      }
      const data = {
        ...(["provider-profile", "institution", "venue", "activity"].includes(body.kind) ? { providerRef } : {}),
        title: body.title,
        contentKey: body.contentKey,
        locale: body.locale,
        kind: body.kind,
        slug: body.slug,
        identity: `${body.contentKey}:${body.locale}`,
        routeKey: `${body.kind}:${body.locale}:${body.slug}`,
        body,
        revision: (current?.revision || 0) + 1,
        contributors: [...new Set([...(Array.isArray(current?.contributors) ? current.contributors : []), current?.lastEditedBy, current?.submittedBy, Number(user!.id)].filter(id => typeof id === "number"))],
        lastEditedBy: Number(user!.id),
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
      if (!isAdmin(user)) delete (saved as any).providerRef;
      return saved;
    }
    if (!current) throw new ContentError("内容不存在", 404);
    if (input.action === "submit")
      return p.update({
        collection: "content-drafts",
        id: current.id,
        data: {
          reviewState: "review",
          submittedBy: Number(user!.id),
          contributors: [...new Set([...(Array.isArray(current.contributors) ? current.contributors : []), current.lastEditedBy, current.submittedBy, Number(user!.id)].filter(id => typeof id === "number"))],
          revision: current.revision + 1,
          reviewNote: "",
        },
        req,
      });
    if (input.action === "return") {
      if (current.reviewState !== "review") throw new ContentError("仅待审核内容可以退回");
      await p.create({ collection: "content-events", data: {
        draftId: current.id, action: "return", actor: Number(user!.id),
        revision: current.revision, overrideReason: selfReview ? overrideReason : "",
      }, req });
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
    }
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
      if (clean.kind === "exhibition") validateExhibitionPublication(clean.exhibition, clean.sources, input.exhibitionReviewed);
      if (isLife(clean.kind)) validateLifePublication(clean.lifestyle,clean.kind,clean.sources,input.lifeReviewed);
      if (clean.kind === "institution") validateInstitutionPublication(clean.institution, clean.sources, input.institutionReviewed);
      if (isCatalog(clean.kind)) {
        validateCatalog(clean.kind, clean.catalog, true);
        if (input.catalogReviewed !== true)
          throw new ContentError(
            "请确认公开文字、图片与核验资料已检查，不含直联方式",
          );
        if (
          clean.kind === "provider-profile" &&
          !(await eligibleProvider(p, current.providerRef, req, clean.catalog?.categories.includes("housekeeping")))
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
                  (d) => d.kind === "provider-profile" && d.contentKey === k && (!clean.catalog!.categories.includes("housekeeping") || houseProviderCovers(clean.catalog!.housekeeping,d.catalog?.housekeeping)),
                ),
            )
          )
            throw new ContentError("指定服务商尚未发布或已暂停");
        }
      }
      const quality=(await (p as any).find({collection:'content-quality',where:{draftId:{equals:current.id}},limit:1,depth:0,req})).docs[0];
      const qualityReview=quality?.state==='checked'&&quality.contentVersion===versionOf(current.body)?{state:'checked',checkedRevision:current.revision,checkedAt:quality.checkedAt,nextReviewAt:quality.nextReviewAt}:null;
      const data = {
        qualityReview,
        providerRef:
          ["provider-profile", "institution", "venue", "activity"].includes(clean.kind) ? current.providerRef : null,
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
        overrideReason: selfReview ? overrideReason : "",
      },
      req,
    });
    return p.update({
      collection: "content-drafts",
      id: current.id,
      data: {
        reviewState: input.action === "publish" ? "approved" : current.reviewState === "review" ? "review" : "draft",
        everPublished: current.everPublished || input.action === "publish",
        revision: current.revision + 1,
      },
      req,
    });
  });
  if (!isAdmin(user)) delete (result as any).providerRef;
  return result;
}
