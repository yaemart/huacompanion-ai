import { isLocale } from "../../lib/locales";
import { randomUUID } from "node:crypto";
import type { Payload } from "payload";
import {
  canEditContent,
  validateContent,
  validateCandidate,
  publicBody,
  type ContentUser,
  type ContentBody,
  type Candidate,
} from "../../lib/content-model";
import { ContentError, contentTransaction } from "../content/service";
export type AgentAdapter = {
  name: string;
  run: (
    input: unknown,
    options: { signal: AbortSignal; maxOutputTokens: number },
  ) => Promise<{
    result: unknown;
    usage: { inputTokens: number; outputTokens: number };
  }>;
};
export async function agentAction(p: Payload, user: ContentUser, input: any) {
  if (!canEditContent(user)) throw new ContentError("无内容管理权限", 403);
  if (input.action === "run") return runTask(p, user, Number(input.id));
  return contentTransaction(p, async (req) => {
    if (input.action === "create") {
      if (
        !["draft", "research", "translate", "check"].includes(input.kind) ||
        typeof input.title !== "string" ||
        !input.title.trim() ||
        input.title.length > 500 ||
        typeof input.material !== "string" ||
        input.material.length > 20000
      )
        throw new ContentError("请填写有效任务与材料（最多20000字符）");
      let draft = null;
      if (input.draftId) {
        draft = await p.findByID({
          collection: "content-drafts",
          id: input.draftId,
          req,
        });
        if (draft.revision !== input.revision)
          throw new ContentError("选定内容已变化，请刷新", 409);
      }
      if (["translate", "check"].includes(input.kind) && !draft)
        throw new ContentError("此任务需要先选定并保存工作稿");
      const locale = input.kind === "translate" ? input.targetLocale : draft?.locale || input.locale || "zh";
      if (!isLocale(locale)) throw new ContentError("请选择有效的目标语言");
      if (input.kind === "translate" && locale === draft!.locale)
        throw new ContentError("翻译目标语言必须与原文不同");
      const sourceBody = draft
        ? publicBody(draft.body as unknown as ContentBody)
        : null;
      const sources = sourceBody?.sources || input.sources || [];
      validateContent({
        contentKey: "validation",
        slug: "validation",
        kind: "guide",
        locale,
        title: "Validation",
        blocks: [],
        sources,
      });
      let target = draft;
      if (input.kind === "translate")
        target =
          (
            await p.find({
              collection: "content-drafts",
              where: { identity: { equals: `${draft!.contentKey}:${locale}` } },
              limit: 1,
              req,
            })
          ).docs[0] || null;
      const selected = {
        instructions: input.title,
        material: input.material,
        sources,
        locale,
        source: sourceBody,
        sourceDraft: draft?.id,
        sourceRevision: draft?.revision,
        targetId: target?.id,
        targetRevision: target?.revision,
        kind: input.kind,
      };
      if (JSON.stringify(selected).length > 20000)
        throw new ContentError("材料与选定内容合计不能超过20000字符");
      return p.create({
        collection: "content-agent-tasks",
        data: {
          title: input.title,
          kind: input.kind,
          status: "unconfigured",
          input: selected as any,
          error: "模型账户尚未配置，未发送任何材料。",
          attempts: 0,
          createdBy: Number(user!.id),
        },
        req,
      });
    }
    const task = await p.findByID({
      collection: "content-agent-tasks",
      id: Number(input.id),
      req,
    });
    if (input.action === "cancel") {
      if (task.adoptedDraft)
        throw new ContentError("该结果已采纳，请在工作稿中处理");
      return p.update({
        collection: "content-agent-tasks",
        id: task.id,
        data: {
          status: "cancelled",
          error: "已取消；已开始的供应商调用可能仍计费。",
        },
        req,
      });
    }
    if (input.action !== "adopt") throw new ContentError("未知任务操作");
    if (task.adoptedDraft) return task;
    if (task.status !== "succeeded")
      throw new ContentError("仅成功结果可以采纳");
    if (task.kind === "check")
      throw new ContentError("检查任务仅供审核参考，不覆盖工作稿");
    const source = task.input as any;
    validateCandidate(
      task.result,
      source.sources.map((s: any) => s.id),
    );
    const result = task.result as unknown as Candidate;
    let target = source.targetId
      ? await p.findByID({
          collection: "content-drafts",
          id: source.targetId,
          req,
        })
      : null;
    if (target && target.revision !== source.targetRevision)
      throw new ContentError("工作稿已变化，请人工比较，不覆盖新稿", 409);
    if (source.sourceDraft) {
      const original = await p.findByID({
        collection: "content-drafts",
        id: source.sourceDraft,
        req,
      });
      if (original.revision !== source.sourceRevision)
        throw new ContentError("原文已变化，请重新生成或人工整理", 409);
    }
    const base = target?.body as unknown as ContentBody | undefined;
    if (base && base.locale !== source.locale)
      throw new ContentError("目标语言不一致，请重新创建任务", 409);
    const body: ContentBody = publicBody({
      ...base,
      contentKey:
        base?.contentKey || source.source?.contentKey || `ai-${task.id}`,
      slug: base?.slug || source.source?.slug || `ai-${task.id}`,
      kind: base?.kind || source.source?.kind || "guide",
      locale: source.locale,
      title: result.title,
      summary: result.summary || "",
      blocks: result.blocks,
      sources: source.sources.filter((s: any) =>
        result.sourceIds.includes(s.id),
      ),
    });
    validateContent(body);
    const data = {
      title: body.title,
      contentKey: body.contentKey,
      locale: body.locale,
      kind: body.kind,
      slug: body.slug,
      identity: `${body.contentKey}:${body.locale}`,
      routeKey: `${body.kind}:${body.locale}:${body.slug}`,
      body: body as any,
      revision: (target?.revision || 0) + 1,
      reviewState: "draft" as const,
      sourceDraft: source.sourceDraft,
      sourceRevision: source.sourceRevision,
    };
    const doc = target
      ? await p.update({
          collection: "content-drafts",
          id: target.id,
          data,
          req,
        })
      : await p.create({ collection: "content-drafts", data, req });
    return p.update({
      collection: "content-agent-tasks",
      id: task.id,
      data: { adoptedDraft: doc.id },
      req,
    });
  });
}
export async function runTask(
  p: Payload,
  user: ContentUser,
  id: number,
  adapter?: AgentAdapter,
  dailyTokenLimit?: number,
) {
  if (!canEditContent(user)) throw new ContentError("无内容管理权限", 403);
  const claimed = await contentTransaction(p, async (req) => {
    const task = await p.findByID({
      collection: "content-agent-tasks",
      id,
      req,
    });
    if (task.adoptedDraft || ["succeeded", "cancelled"].includes(task.status))
      throw new ContentError("已完成或取消的任务不能重跑");
    if (task.lease && new Date(task.leaseUntil || 0).getTime() > Date.now())
      throw new ContentError("该任务仍有调用在途，请稍后处理", 409);
    if (!adapter)
      return p.update({
        collection: "content-agent-tasks",
        id,
        data: {
          status: "unconfigured",
          error: "模型账户尚未配置，未发送材料，未发生调用。",
        },
        req,
      });
    const running = await p.find({
      collection: "content-agent-tasks",
      where: { lease: { exists: true } },
      limit: 100,
      req,
    });
    for (const old of running.docs) {
      if (new Date(old.leaseUntil || 0).getTime() > Date.now())
        throw new ContentError("已有任务运行中，请稍后重试", 409);
      await p.update({
        collection: "content-agent-tasks",
        id: old.id,
        data: {
          status: "failed",
          lease: null,
          error: "执行已中断，费用未知；需要人工核对后重试。",
        },
        req,
      });
    }
    const reserved =
      Buffer.byteLength(JSON.stringify(task.input), "utf8") + 4000;
    const day = new Date().toISOString().slice(0, 10);
    const tasks = await p.find({
      collection: "content-agent-tasks",
      limit: 10000,
      req,
    });
    const total = tasks.docs.reduce(
      (n, t) =>
        n +
        ((t.usage as any)?.attempts || [])
          .filter((a: any) => a.day === day)
          .reduce((m: number, a: any) => m + a.reserved, 0),
      0,
    );
    if (
      !Number.isSafeInteger(dailyTokenLimit) ||
      dailyTokenLimit! <= 0 ||
      total + reserved > dailyTokenLimit!
    )
      throw new ContentError("每日令牌额度未设置或不足，未调用模型");
    const attempts = [
      ...((task.usage as any)?.attempts || []),
      {
        day,
        reserved,
        model: adapter.name,
        startedAt: new Date().toISOString(),
        cost: "unknown",
      },
    ];
    return p.update({
      collection: "content-agent-tasks",
      id,
      data: {
        status: "running",
        lease: randomUUID(),
        leaseUntil: new Date(Date.now() + 120000).toISOString(),
        attempts: (task.attempts || 0) + 1,
        error: "",
        usage: { attempts },
      },
      req,
    });
  });
  if (!adapter || claimed.status !== "running") return claimed;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      adapter.run(claimed.input, {
        signal: controller.signal,
        maxOutputTokens: 4000,
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(Error("模型调用超时，费用未知；不会自动重试。"));
        }, 90000);
      }),
    ]);
    const input = claimed.input as any;
    validateCandidate(
      result.result,
      input.sources.map((s: any) => s.id),
    );
    return await contentTransaction(p, async (req) => {
      const latest = await p.findByID({
        collection: "content-agent-tasks",
        id,
        req,
      });
      if (latest.lease !== claimed.lease) return latest;
      if (latest.status !== "running")
        return p.update({
          collection: "content-agent-tasks",
          id,
          data: { lease: null, leaseUntil: null },
          req,
        });
      const usage = latest.usage as any;
      const last = usage.attempts.at(-1);
      if (
        Number.isSafeInteger(result.usage.inputTokens) &&
        Number.isSafeInteger(result.usage.outputTokens) &&
        result.usage.inputTokens >= 0 &&
        result.usage.outputTokens >= 0
      ) {
        last.actual = result.usage;
        last.reserved = Math.max(
          last.reserved,
          result.usage.inputTokens + result.usage.outputTokens,
        );
      }
      last.finishedAt = new Date().toISOString();
      return p.update({
        collection: "content-agent-tasks",
        id,
        data: {
          status: "succeeded",
          result: result.result as any,
          usage,
          lease: null,
          leaseUntil: null,
        },
        req,
      });
    });
  } catch (e) {
    return await contentTransaction(p, async (req) => {
      const latest = await p.findByID({
        collection: "content-agent-tasks",
        id,
        req,
      });
      if (latest.lease !== claimed.lease) return latest;
      if (latest.status !== "running")
        return p.update({
          collection: "content-agent-tasks",
          id,
          data: { lease: null, leaseUntil: null },
          req,
        });
      return p.update({
        collection: "content-agent-tasks",
        id,
        data: {
          status: "failed",
          lease: null,
          leaseUntil: null,
          error:
            e instanceof Error
              ? e.message.slice(0, 1000)
              : "生成失败；未自动重试",
        },
        req,
      });
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}
