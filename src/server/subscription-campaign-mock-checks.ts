import { createHash } from "node:crypto";
import type { Payload } from "payload";
import type { SubscriptionCampaignCheck } from "../../payload-types";
import { relationID, type Staff } from "../cms/access";
import { ContentError } from "./content/error";
import { withCampaignDraft } from "./subscription-campaign-drafts";
import { requireCampaignGrant } from "./subscription-campaign-access";

const collection = "subscription-campaign-checks";
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
type Input = { campaignKey: unknown; revision: unknown; testId?: unknown; readable?: unknown };
export async function campaignMockChecks(
  p: Payload,
  actor: Staff,
  action: "status" | "test" | "confirm",
  value: unknown,
) {
  const fields = ["campaignKey", "revision"];
  if (action === "confirm") fields.push("testId", "readable");
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !fields.includes(key)) ||
    !("campaignKey" in value) ||
    !("revision" in value) ||
    !["status", "test", "confirm"].includes(action)
  )
    throw new ContentError("请从已保存的活动草稿重新打开模拟测试。", 400);
  const input = value as Input;
  const result = await withCampaignDraft(
    p,
    actor,
    input.campaignKey,
    input.revision,
    async (req, row, snapshot) => {
      const grant = await requireCampaignGrant(p, actor, "policy-updates", req);
      const settings = await p.findGlobal({ slug: "workflow-settings", req, depth: 0 });
      const configuration = [
        "APP_URL",
        "WORKFLOW_MAIL_ENABLED",
        "WORKFLOW_MAIL_FROM",
        "WORKFLOW_MAIL_API_KEY",
        "SUBSCRIPTIONS_ENABLED",
        "SUBSCRIPTION_MAIL_LINKS_VERIFIED",
        "PRIVACY_VERSION",
        "SITE_LOCALES",
      ].map((key) => process.env[key] ?? "");
      const contextHash = digest([
        "local-mock-v1",
        row.id,
        row.selections,
        row.preview,
        snapshot.current,
        grant.grantId,
        grant.grantRevision,
        settings.emailEnabled,
        settings.updatedAt,
        configuration,
      ]);
      const enabled = process.env.APP_ENV === "local";
      const available = enabled && snapshot.current;
      const languages = (["zh", "en"] as const).filter((locale) => snapshot.preview[locale]);
      let auditId: number | null = null;
      async function record(
        kind: SubscriptionCampaignCheck["kind"],
        binding: string,
        test?: number,
      ) {
        const check = await p.create({
          collection,
          req,
          depth: 0,
          data: {
            draft: row.id,
            kind,
            binding,
            contextHash,
            actor: grant.actorId,
            languages,
            test,
          },
        });
        const audit = await p.create({
          collection: "audit-events",
          req,
          data: {
            entity: collection,
            recordId: String(check.id),
            action: kind,
            actor: grant.actorId,
            fields: "draft,kind,languages",
            after: { campaignKey: row.campaignKey, revision: row.revision, languages },
          },
        });
        auditId = audit.id;
        return check;
      }
      const latest = (
        await p.find({
          collection,
          req,
          depth: 0,
          limit: 1,
          sort: "-id",
          where: { draft: { equals: row.id } },
        })
      ).docs[0];
      let binding = latest?.contextHash === contextHash ? latest.binding : contextHash;
      if (enabled && latest && latest.contextHash !== contextHash) {
        binding = digest([contextHash, latest.id]);
        await record("mock-reset", binding);
      }
      const checks = await p.find({
        collection,
        req,
        depth: 0,
        limit: 2,
        where: {
          and: [
            { draft: { equals: row.id } },
            { binding: { equals: binding } },
            { kind: { not_equals: "mock-reset" } },
          ],
        },
      });
      let tested = available ? checks.docs.find((check) => check.kind === "mock-test") : undefined;
      let confirmed = available
        ? checks.docs.find((check) => check.kind === "mock-confirm")
        : undefined;
      let error: ContentError | undefined;
      try {
        if (action !== "status") {
          if (!enabled) throw new ContentError("仅支持本地模拟，真实测试和发送尚未开放。", 403);
          if (!snapshot.current)
            throw new ContentError("来源已变化，请重新选择政策并保存草稿后测试。", 409);
          if (languages.some((locale) => snapshot.preview[locale]!.body.length > 20000))
            throw new ContentError("模拟邮件正文过长，请减少所选政策并重新保存。", 400);
          if (action === "confirm") {
            if (!tested || input.testId !== tested.id)
              throw new ContentError(
                "尚无有效模拟测试，或测试条件已变化，请重新生成模拟邮件。",
                409,
              );
            const readable = input.readable;
            if (
              !Array.isArray(readable) ||
              readable.length !== languages.length ||
              !languages.every((locale) => readable.includes(locale))
            )
              throw new ContentError("请逐一勾选每种可用语言，确认模拟邮件可读。", 400);
          }
          if (action === "test" ? !tested : !confirmed) {
            const check = await record(
              action === "test" ? "mock-test" : "mock-confirm",
              binding,
              action === "confirm" ? tested!.id : undefined,
            );
            if (action === "test") tested = check;
            else confirmed = check;
          }
        }
      } catch (failure) {
        if (!(failure instanceof ContentError)) throw failure;
        error = failure;
      }
      return {
        auditId,
        error,
        state: {
          campaignKey: row.campaignKey,
          enabled,
          current: snapshot.current,
          tested: !!tested,
          mockConfirmed: !!tested && relationID(confirmed?.test) === tested.id,
          testId: tested?.id ?? null,
          messages: tested
            ? languages.map((locale) => ({
                locale,
                to: "preview@example.invalid",
                ...snapshot.preview[locale]!,
              }))
            : [],
        },
      };
    },
  );
  if (
    result.auditId !== null &&
    !(await p.findByID({
      collection: "audit-events",
      id: result.auditId,
      depth: 0,
      disableErrors: true,
    }))
  )
    throw new ContentError("模拟操作未保存成功，请刷新后重试。", 503);
  if (result.error) throw result.error;
  return result.state;
}
