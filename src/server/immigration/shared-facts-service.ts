import type { Payload, PayloadRequest } from "payload";
import type { PolicyFactDraft } from "../../../payload-types";
import type { ContentUser } from "../../lib/content-model";
import { isAdmin, canAccessContentKind, relationID } from "../../cms/access";
import { sharedFactDraft, validateSharedFacts } from "../../lib/policy-shared-facts";
import {
  assertPolicyCountry,
  policyTestCountriesAllowed,
} from "../../lib/immigration-policy-entry";
import { contentTransaction, ContentError } from "../content/service";
import { policyActor } from "./workflow";
import { syncSharedNoteTasks } from "./shared-note-tasks";
export interface SharedFactInput {
  action: "save" | "submit" | "return" | "publish" | "restore" | "unpublish";
  groupId?: number;
  revision?: number;
  contentKey?: string;
  facts?: unknown;
  versionId?: number;
  policyReviewed?: boolean;
  note?: string;
  overrideReason?: string;
}
type Req = Partial<PayloadRequest>;
async function draftFor(p: Payload, req: Req, groupId: number) {
  const draft = (
    await p.find({
      collection: "policy-fact-drafts",
      req,
      depth: 0,
      where: { group: { equals: groupId } },
      limit: 1,
    })
  ).docs[0];
  if (!draft) throw new ContentError("政策事实工作稿不存在", 404);
  return draft;
}
async function versionsFor(p: Payload, req: Req, group: number, limit = 50) {
  return (
    await p.find({
      collection: "policy-fact-versions",
      req,
      depth: 0,
      where: { group: { equals: group } },
      sort: "-revision",
      limit,
    })
  ).docs;
}
export async function readSharedPolicyFacts(p: Payload, user: ContentUser, groupId: number) {
  return contentTransaction(p, async (req) => {
    await policyActor(p, req, user, "read");
    const group = await p.findByID({ collection: "policy-groups", id: groupId, req, depth: 0 });
    const draft = await draftFor(p, req, group.id);
    const versions = await versionsFor(p, req, group.id);
    return { group, draft, versions };
  });
}
export async function mutateSharedPolicyFacts(
  p: Payload,
  user: ContentUser,
  input: SharedFactInput,
): Promise<PolicyFactDraft> {
  if (!["save", "restore", "submit", "return", "publish", "unpublish"].includes(input.action))
    throw new ContentError("未知政策操作");
  if (input.groupId !== undefined && (!Number.isSafeInteger(input.groupId) || input.groupId < 1))
    throw new ContentError("政策编号无效");
  return contentTransaction(p, async (req) => {
    const actor = await policyActor(p, req, user, input.action);
    let group = input.groupId
      ? await p.findByID({ collection: "policy-groups", id: input.groupId, req, depth: 0 })
      : null;
    const old = group ? await draftFor(p, req, group.id) : null;
    if (old && old.revision !== input.revision)
      throw new ContentError("政策已经更新，请刷新后重试", 409);
    if (!old && input.action !== "save") throw new ContentError("请选择政策");
    if (old?.reviewState === "review" && ["save", "restore", "submit"].includes(input.action))
      throw new ContentError("待审核事实须先退回后才能修改", 409);
    const prior = Array.isArray(old?.contributors) ? old.contributors : [];
    const contributors = [
      ...new Set(
        [...prior, old?.lastEditedBy, old?.submittedBy].filter(
          (id): id is number => typeof id === "number",
        ),
      ),
    ];
    const selfReview = contributors.includes(actor.id);
    const reason =
      typeof input.overrideReason === "string" ? input.overrideReason.trim().slice(0, 2000) : "";
    if (
      ["return", "publish", "unpublish"].includes(input.action) &&
      selfReview &&
      (!isAdmin(actor) || !reason)
    )
      throw new ContentError("不能审核自己编辑或提交的事实；管理员须填写例外原因", 403);
    let data: Partial<PolicyFactDraft> = { revision: (old?.revision || 0) + 1 };
    let versionId: number | undefined;
    if (["save", "restore"].includes(input.action)) {
      let facts = input.facts;
      if (input.action === "restore") {
        const v = await p.findByID({
          collection: "policy-fact-versions",
          id: input.versionId!,
          req,
          depth: 0,
        });
        if (relationID(v.group) !== group!.id) throw new ContentError("历史版本不属于此政策", 409);
        facts = v.facts;
      }
      const merged =
        input.action === "restore"
          ? sharedFactDraft(facts)
          : { ...sharedFactDraft(old?.facts || {}), ...sharedFactDraft(facts) };
      assertPolicyCountry(merged.countryCode, policyTestCountriesAllowed(process.env));
      data = {
        ...data,
        facts: merged,
        reviewState: "draft",
        reviewNote: "",
        lastEditedBy: actor.id,
        contributors: [...new Set([...contributors, actor.id])],
      };
      if (!group) {
        if (
          typeof input.contentKey !== "string" ||
          !/^[a-z0-9][a-z0-9-]{0,99}$/.test(input.contentKey)
        )
          throw new ContentError("政策标识格式无效");
        if (
          (
            await p.count({
              collection: "policy-groups",
              req,
              where: { contentKey: { equals: input.contentKey } },
            })
          ).totalDocs
        )
          throw new ContentError("政策标识已存在，原记录未覆盖", 409);
        group = await p.create({
          collection: "policy-groups",
          data: { contentKey: input.contentKey!, revision: 1 },
          req,
        });
      }
    } else if (input.action === "submit" || input.action === "publish") {
      if (
        input.action === "publish" &&
        (old!.reviewState !== "review" || input.policyReviewed !== true)
      )
        throw new ContentError("仅待审核事实可发布；请确认已人工核实国家、来源和政策条件");
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(
        new Date(),
      );
      validateSharedFacts(old!.facts, today, policyTestCountriesAllowed(process.env));
      const verifier = await p.findByID({
        collection: "staff",
        id: old!.facts.verifiedBy,
        req,
        depth: 0,
      });
      if (!canAccessContentKind(verifier, "immigration-policy"))
        throw new ContentError("核实人须为有效且获政策板块授权的员工", 403);
      if (input.action === "submit")
        data = {
          ...data,
          reviewState: "review",
          reviewNote: "",
          submittedBy: actor.id,
          contributors: [...new Set([...contributors, actor.id])],
        };
      else {
        const previous = (await versionsFor(p, req, group!.id, 1))[0];
        const version = await p.create({
          collection: "policy-fact-versions",
          req,
          data: {
            group: group!.id,
            revision: (previous?.revision || 0) + 1,
            facts: old!.facts,
            sourceRevision: old!.revision,
            approvedBy: actor.id,
            contributors,
            overrideReason: selfReview ? reason : "",
          },
        });
        versionId = version.id;
        data = { ...data, reviewState: "approved", reviewNote: "" };
      }
    } else if (input.action === "return") {
      if (old!.reviewState !== "review") throw new ContentError("仅待审核事实可以退回");
      if (typeof input.note !== "string" || !input.note.trim())
        throw new ContentError("退回必须填写修改原因");
      data = { ...data, reviewState: "returned", reviewNote: input.note.trim().slice(0, 2000) };
    } else if (!group!.activeFactVersion) throw new ContentError("政策尚未发布");
    if (input.action === "publish" || input.action === "unpublish") {
      await p.update({
        collection: "policy-groups",
        id: group!.id,
        req,
        data: { activeFactVersion: versionId || null, revision: group!.revision + 1 },
      });
      await syncSharedNoteTasks(p, req, group!, versionId || null);
    }
    const saved = old
      ? await p.update({ collection: "policy-fact-drafts", id: old.id, data, req })
      : await p.create({
          collection: "policy-fact-drafts",
          data: {
            ...data,
            group: group!.id,
            revision: 1,
            facts: data.facts!,
            reviewState: "draft",
          },
          req,
        });
    await p.create({
      collection: "audit-events",
      req,
      data: {
        entity: "policy-group",
        recordId: String(group!.id),
        action: input.action,
        actor: actor.id,
        before: { revision: old?.revision, reviewState: old?.reviewState },
        after: {
          draft: saved.id,
          revision: saved.revision,
          reviewState: saved.reviewState,
          versionId,
          restoredFrom: input.action === "restore" ? input.versionId : undefined,
          note: input.action === "return" ? saved.reviewNote : undefined,
          overrideReason: selfReview ? reason : "",
        },
      },
    });
    return saved;
  });
}
