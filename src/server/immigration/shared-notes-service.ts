import type { Payload, PayloadRequest, Where } from "payload";
import type { PolicyNoteDraft } from "../../../payload-types";
import { canEditContent, type ContentUser } from "../../lib/content-model";
import { canReviewContent, isAdmin, relationID } from "../../cms/access";
import { policyIdentity, policyTestCountriesAllowed } from "../../lib/immigration-policy-entry";
import { sharedPolicyForm } from "../../lib/policy-shared-form";
import { publicSharedFacts, validateSharedFacts } from "../../lib/policy-shared-facts";
import { shanghaiToday } from "../../lib/exhibitions";
import { policyNoteDraft, explanationFactWarning } from "../../lib/policy-shared-notes";
import { contentTransaction, ContentError } from "../content/service";
import { policyActor } from "./workflow";
export interface SharedNoteInput {
  action: "save" | "submit" | "return" | "publish" | "restore" | "unpublish";
  groupId: number;
  locale: "zh" | "en";
  factVersion: number | null;
  revision?: number;
  body?: unknown;
  versionId?: number;
  noteReviewed?: boolean;
  note?: string;
  overrideReason?: string;
}
type Req = Partial<PayloadRequest>;
async function noteRecords(p: Payload, req: Req, group: number, locale: "zh" | "en") {
  const where: Where = { and: [{ group: { equals: group } }, { locale: { equals: locale } }] };
  const draft =
    (await p.find({ collection: "policy-note-drafts", req, where, depth: 0, limit: 1 })).docs[0] ||
    null;
  const versions = (
    await p.find({
      collection: "policy-note-versions",
      req,
      where,
      depth: 0,
      sort: "-revision",
      limit: 50,
    })
  ).docs;
  return { draft, versions };
}
function identity(group: number, locale: string) {
  if (!Number.isSafeInteger(group) || group < 1 || !["zh", "en"].includes(locale))
    throw new ContentError("政策或语言无效");
}
export async function readSharedPolicyNote(
  p: Payload,
  user: ContentUser,
  groupId: number,
  locale: "zh" | "en",
) {
  identity(groupId, locale);
  return contentTransaction(p, async (req) => {
    const actor = await policyActor(p, req, user, "read");
    const group = await p.findByID({ collection: "policy-groups", id: groupId, req, depth: 0 });
    const records = await noteRecords(p, req, group.id, locale);
    const id = relationID(group.activeFactVersion);
    const fact = id
      ? await p.findByID({ collection: "policy-fact-versions", id, req, depth: 0 })
      : null;
    if (fact && relationID(fact.group) !== group.id) throw Error("正式事实不属于该政策");
    const today = shanghaiToday();
    let facts = null;
    if (fact) {
      validateSharedFacts(fact.facts, today, policyTestCountriesAllowed(process.env));
      facts = publicSharedFacts(fact.facts);
    }
    const draft = fact
      ? null
      : (
          await p.find({
            collection: "policy-fact-drafts",
            req,
            depth: 0,
            limit: 1,
            where: { group: { equals: group.id } },
          })
        ).docs[0];
    return {
      group,
      ...records,
      locale,
      facts,
      factRevision: fact?.revision ?? null,
      defaultBody: {
        title:
          policyIdentity(sharedPolicyForm(fact?.facts || draft?.facts), locale)?.title ||
          group.contentKey,
        slug: group.contentKey,
        publicNotes: "",
      },
      permissions: {
        canEdit: canEditContent(actor),
        canReview: canReviewContent(actor),
        isAdmin: isAdmin(actor),
        userId: actor.id,
      },
      warning: explanationFactWarning(records.draft?.publicNotes || ""),
    };
  });
}
async function noteTask(
  p: Payload,
  req: Req,
  group: number,
  locale: string,
  fact: number,
  actor: number,
  done: boolean,
) {
  const key = `policy-note-review:${group}:${locale}:${fact}`;
  const old = (
    await p.find({
      collection: "workflow-tasks",
      req,
      depth: 0,
      limit: 1,
      where: { key: { equals: key } },
    })
  ).docs[0];
  const data = {
    status: done ? ("done" as const) : ("open" as const),
    history: [
      ...(Array.isArray(old?.history) ? old.history : []),
      {
        action: done ? "note-approved" : "note-unpublished",
        actor,
        at: new Date().toISOString(),
        factVersion: fact,
      },
    ],
  };
  if (old) await p.update({ collection: "workflow-tasks", id: old.id, data, req });
  else
    await p.create({
      collection: "workflow-tasks",
      req,
      data: { ...data, key, policyGroup: group, title: `政策说明待复核（${locale}）：${group}` },
    });
}
export async function mutateSharedPolicyNote(
  p: Payload,
  user: ContentUser,
  input: SharedNoteInput,
): Promise<PolicyNoteDraft> {
  identity(input.groupId, input.locale);
  if (!["save", "submit", "return", "publish", "restore", "unpublish"].includes(input.action))
    throw new ContentError("未知说明操作");
  return contentTransaction(p, async (req) => {
    const actor = await policyActor(p, req, user, input.action);
    const group = await p.findByID({
      collection: "policy-groups",
      id: input.groupId,
      req,
      depth: 0,
    });
    const active = relationID(group.activeFactVersion) ?? null;
    if (input.factVersion !== active)
      throw new ContentError("事实版本已经变化，请按当前事实重新复核", 409);
    const { draft: old, versions } = await noteRecords(p, req, group.id, input.locale);
    if (old && input.revision !== old.revision)
      throw new ContentError("说明已经更新，请刷新后重试", 409);
    if (!old && input.action !== "save" && input.action !== "restore")
      throw new ContentError("请先保存说明");
    if (old?.reviewState === "review" && ["save", "restore", "submit"].includes(input.action))
      throw new ContentError("待审核说明须先退回后修改", 409);
    const ids = Array.isArray(old?.contributors) ? old.contributors : [];
    const contributors = [
      ...new Set(
        [...ids, old?.lastEditedBy, old?.submittedBy].filter(
          (id): id is number => typeof id === "number",
        ),
      ),
    ];
    const selfReview = contributors.includes(actor.id);
    const reason =
      typeof input.overrideReason === "string" ? input.overrideReason.trim().slice(0, 2000) : "";
    if (
      ["publish", "return", "unpublish"].includes(input.action) &&
      selfReview &&
      (!isAdmin(actor) || !reason)
    )
      throw new ContentError("不能审核自己编辑或提交的说明；管理员须填写例外原因", 403);
    let data: Partial<PolicyNoteDraft> = { revision: (old?.revision || 0) + 1 };
    let versionId: number | undefined;
    if (input.action === "save" || input.action === "restore") {
      let body = input.body;
      if (input.action === "restore") {
        const v = await p.findByID({
          collection: "policy-note-versions",
          id: input.versionId!,
          req,
          depth: 0,
        });
        if (relationID(v.group) !== group.id || v.locale !== input.locale)
          throw new ContentError("历史说明不属于此政策和语言", 409);
        body = { title: v.title, slug: v.slug, publicNotes: v.publicNotes ?? "" };
      }
      const fields = {
        title: old?.title || group.contentKey,
        slug: old?.slug || group.contentKey,
        publicNotes: old?.publicNotes ?? "",
        ...policyNoteDraft(body),
      };
      if (versions[0] && versions[0].slug !== fields.slug)
        throw new ContentError("已发布的网址不能修改");
      const duplicate = await p.count({
        collection: "policy-note-drafts",
        req,
        where: {
          and: [
            { id: { not_equals: old?.id || 0 } },
            { locale: { equals: input.locale } },
            { slug: { equals: fields.slug } },
          ],
        },
      });
      if (duplicate.totalDocs) throw new ContentError("同语言的网址标识已存在，原记录未覆盖", 409);
      data = {
        ...data,
        ...fields,
        basedOnFactVersion: active,
        reviewState: "draft",
        reviewNote: "",
        lastEditedBy: actor.id,
        contributors: [...new Set([...contributors, actor.id])],
      };
    } else if (input.action === "submit" || input.action === "publish") {
      if (!active || relationID(old!.basedOnFactVersion) !== active)
        throw new ContentError("请依据当前正式事实重新保存并复核说明", 409);
      if (input.action === "submit")
        data = {
          ...data,
          reviewState: "review",
          reviewNote: "",
          submittedBy: actor.id,
          contributors: [...new Set([...contributors, actor.id])],
        };
      else {
        if (old!.reviewState !== "review" || input.noteReviewed !== true)
          throw new ContentError("仅待审核说明可发布；请确认已对照当前事实核实说明");
        const v = await p.create({
          collection: "policy-note-versions",
          req,
          data: {
            group: group.id,
            locale: input.locale,
            revision: (versions[0]?.revision || 0) + 1,
            title: old!.title,
            slug: old!.slug,
            publicNotes: old!.publicNotes ?? "",
            basedOnFactVersion: active,
            sourceRevision: old!.revision,
            approvedBy: actor.id,
            contributors,
            overrideReason: selfReview ? reason : "",
          },
        });
        versionId = v.id;
        data = {
          ...data,
          publishedNoteVersion: v.id,
          needsReview: false,
          reviewState: "approved",
          reviewNote: "",
        };
        await noteTask(p, req, group.id, input.locale, active, actor.id, true);
      }
    } else if (input.action === "return") {
      if (old!.reviewState !== "review" || typeof input.note !== "string" || !input.note.trim())
        throw new ContentError("仅待审核说明可以退回，且必须填写修改原因");
      data = { ...data, reviewState: "returned", reviewNote: input.note.trim().slice(0, 2000) };
    } else {
      if (!old!.publishedNoteVersion) throw new ContentError("说明尚未发布");
      data = { ...data, publishedNoteVersion: null, needsReview: true, reviewState: "draft" };
      if (active) await noteTask(p, req, group.id, input.locale, active, actor.id, false);
    }
    const saved = old
      ? await p.update({ collection: "policy-note-drafts", id: old.id, req, data })
      : await p.create({
          collection: "policy-note-drafts",
          req,
          data: {
            ...data,
            group: group.id,
            locale: input.locale,
            revision: 1,
            title: data.title!,
            slug: data.slug!,
            needsReview: true,
            reviewState: "draft",
          },
        });
    await p.create({
      collection: "audit-events",
      req,
      data: {
        entity: "policy-note",
        recordId: String(group.id),
        action: input.action,
        actor: actor.id,
        before: {
          draft: old?.id,
          revision: old?.revision,
          publishedNoteVersion: relationID(old?.publishedNoteVersion),
        },
        after: {
          locale: input.locale,
          factVersion: active,
          draft: saved.id,
          revision: saved.revision,
          versionId,
          restoredFrom: input.action === "restore" ? input.versionId : undefined,
          note: saved.reviewNote,
          overrideReason: selfReview ? reason : "",
        },
      },
    });
    return saved;
  });
}
