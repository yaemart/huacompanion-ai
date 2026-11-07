import type { Payload } from "payload";
import {
  canAccessContentKind,
  canManageContent,
  canReviewContent,
  contentScope,
  relationID,
  type Staff,
} from "../../cms/access";
import { completeness, translationCoverage, validateQualityReview } from "../../lib/quality";
import { versionOf } from "../../cms/quality/hooks";
import { contentTransaction, ContentError } from "../content/service";
import { enqueueWorkflowEvent } from "../workflow/service";
export async function qualityDesk(payload: Payload, user: Staff) {
  if (!canManageContent(user) || contentScope(user) === false)
    throw new ContentError("无内容权限", 403);
  const p = payload as any;
  const drafts = (
    await p.find({
      collection: "content-drafts",
      overrideAccess: false,
      user,
      depth: 0,
      pagination: false,
    })
  ).docs;
  const metadata = (
    await p.find({
      collection: "content-quality",
      overrideAccess: false,
      user,
      depth: 0,
      pagination: false,
    })
  ).docs;
  const owners = (
    await p.find({ collection: "staff", overrideAccess: true, depth: 0, pagination: false })
  ).docs
    .filter(
      (s: any) => s.active !== false && drafts.some((d: any) => canAccessContentKind(s, d.kind)),
    )
    .map((s: any) => ({
      id: s.id,
      name: s.name,
      kinds: drafts.filter((d: any) => canAccessContentKind(s, d.kind)).map((d: any) => d.kind),
    }));
  return {
    owners,
    canReview: canReviewContent(user),
    items: drafts.map((d: any) => {
      const quality = metadata.find((q: any) => q.draftId === d.id);
      const siblings = drafts.filter(
        (s: any) => s.kind === d.kind && s.contentKey === d.contentKey,
      );
      const coverage = translationCoverage(siblings);
      for (const sibling of siblings) {
        const q = metadata.find((q: any) => q.draftId === sibling.id);
        if (sibling.sourceDraft) {
          const source = siblings.find((s: any) => s.id === sibling.sourceDraft);
          coverage[sibling.locale as keyof typeof coverage] =
            source && q?.state === "checked" && q.sourceVersion === versionOf(source.body)
              ? "current"
              : "review-needed";
        }
      }
      return {
        id: d.id,
        title: d.title,
        kind: d.kind,
        locale: d.locale,
        revision: d.revision,
        contentKey: d.contentKey,
        sources: d.body?.sources || [],
        completeness: completeness(d.body),
        coverage,
        quality,
      };
    }),
  };
}
export async function reviewQuality(payload: Payload, user: Staff, draftId: number, input: any) {
  if (!canReviewContent(user)) throw new ContentError("需要内容审核权限", 403);
  return contentTransaction(payload, async (req) => {
    const p = payload as any;
    // Match intake lock ordering: content/catalog, then business/staff authority.
    // Staff authority edits take this same lock, so both actor and owner remain
    // eligible through commit even if their cached authentication is stale.
    const session = p.db.sessions?.[req.transactionID];
    if (!session) throw Error("Transaction session missing");
    await session.db.execute("SELECT pg_advisory_xact_lock(726281)");
    const actor = await p.findByID({
      collection: "staff",
      id: user!.id,
      overrideAccess: true,
      req,
      depth: 0,
    });
    if (!canReviewContent(actor)) throw new ContentError("需要内容审核权限", 403);
    user = actor;
    const draft = await p.findByID({
      collection: "content-drafts",
      id: draftId,
      req,
      overrideAccess: false,
      user,
      depth: 0,
    });
    if (!canAccessContentKind(user, draft.kind)) throw new ContentError("无内容板块权限", 403);
    if (input.revision !== draft.revision) throw new ContentError("内容已更新，请刷新后复核", 409);
    validateQualityReview(input, draft.body);
    const owner = await p.findByID({
      collection: "staff",
      id: input.owner,
      overrideAccess: true,
      req,
      depth: 0,
    });
    if (!canAccessContentKind(owner, draft.kind))
      throw new ContentError("负责人必须是已启用且具有本板块权限的员工");
    let sourceVersion: string | undefined;
    if (draft.sourceDraft) {
      const source = await p.findByID({
        collection: "content-drafts",
        id: draft.sourceDraft,
        overrideAccess: false,
        user,
        req,
        depth: 0,
      });
      if (
        source.contentKey !== draft.contentKey ||
        source.kind !== draft.kind ||
        source.locale === draft.locale
      )
        throw new ContentError("翻译来源关联无效");
      sourceVersion = versionOf(source.body);
    }
    const existing = (
      await p.find({
        collection: "content-quality",
        where: { draftId: { equals: draftId } },
        limit: 1,
        req,
        overrideAccess: true,
        depth: 0,
      })
    ).docs[0];
    const data = {
      draftId,
      title: draft.title,
      kind: draft.kind,
      contentKey: draft.contentKey,
      locale: draft.locale,
      owner: owner.id,
      state: "checked",
      contentVersion: versionOf(draft.body),
      checkedRevision: draft.revision,
      checkedAt: new Date().toISOString(),
      nextReviewAt: new Date(input.nextReviewAt).toISOString(),
      reason: input.reason.trim(),
      sourceIds: [...new Set(input.sourceIds)],
      checkedBy: user!.id,
      sourceDraft: draft.sourceDraft || null,
      sourceVersion: sourceVersion || null,
    };
    const result = existing
      ? await p.update({
          collection: "content-quality",
          id: existing.id,
          data,
          req,
          overrideAccess: true,
        })
      : await p.create({ collection: "content-quality", data, req, overrideAccess: true });
    await p.create({
      collection: "content-quality-events",
      req,
      overrideAccess: true,
      data: {
        draftId,
        kind: draft.kind,
        actor: user!.id,
        revision: draft.revision,
        reason: data.reason,
        sourceIds: data.sourceIds,
        nextReviewAt: data.nextReviewAt,
        sourceVersion,
      },
    });
    return result;
  });
}
export async function runQualityReview(payload: Payload) {
  const p = payload as any;
  let queued = 0;
  const now = new Date().toISOString();
  const rows = (
    await p.find({
      collection: "content-quality",
      where: {
        or: [{ state: { equals: "review-needed" } }, { nextReviewAt: { less_than_equal: now } }],
      },
      pagination: false,
      depth: 0,
      overrideAccess: true,
    })
  ).docs;
  for (const row of rows) {
    const ownerID = relationID(row.owner);
    if (!ownerID) continue;
    const owner = await p
      .findByID({ collection: "staff", id: ownerID, depth: 0, overrideAccess: true })
      .catch(() => null);
    const draft = await p
      .findByID({ collection: "content-drafts", id: row.draftId, depth: 0, overrideAccess: true })
      .catch(() => null);
    if (!draft || !canAccessContentKind(owner, draft.kind)) continue;
    await enqueueWorkflowEvent(payload, {
      key: `quality:${draft.id}:${row.contentVersion}:${row.checkedAt || "unchecked"}:${row.nextReviewAt || "none"}`,
      type: "quality-due",
      contentDraft: draft.id,
      recipient: ownerID,
      title: "内容待复核",
      dueAt: row.nextReviewAt || now,
    });
    queued++;
  }
  return { queued };
}
