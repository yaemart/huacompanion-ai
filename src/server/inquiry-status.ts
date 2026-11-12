import type { Payload } from "payload";
import { relationID, type Staff } from "../cms/access";
import { inquiryStatusToken } from "../cms/inquiry-status";
import { inquiryCaseID } from "../lib/intake-case";
import {
  coordinationStageLabels,
  inquiryStatusLabels,
  isInquiryClosed,
  type InquiryPair,
} from "../lib/inquiry-status";
import { businessInquiry, businessTransaction } from "./business/service";
import { ContentError } from "./content/error";

function openOption<T extends string>(labels: Record<T, string>, value: unknown): value is T {
  return typeof value === "string" && value !== "closed" && Object.hasOwn(labels, value);
}

function readCommand(input: unknown) {
  const value = (input ?? {}) as Record<string, unknown>;
  const { action, key, updatedAt, status, coordinationStage } = value;
  const id = inquiryCaseID(value.id);
  if (!id || (action !== "close" && action !== "reopen"))
    throw new ContentError("咨询编号或操作无效");
  if (typeof key !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(key))
    throw new ContentError("操作编号无效，请刷新后重试");
  if (typeof updatedAt !== "string" || !Number.isFinite(Date.parse(updatedAt)))
    throw new ContentError("无法读取保存版本，请刷新后重试");
  const reason = typeof value.reason === "string" ? value.reason.trim() : "";
  if (!reason || reason.length > 2000) throw new ContentError("请填写原因，最多 2000 字");
  let next: InquiryPair = { status: "closed", coordinationStage: "closed" };
  if (action === "reopen") {
    if (
      !openOption(inquiryStatusLabels, status) ||
      !openOption(coordinationStageLabels, coordinationStage)
    )
      throw new ContentError("请选择重开后的处理状态和协调进度");
    next = { status, coordinationStage };
  }
  return { id, action, key, updatedAt, reason, next };
}

function state({ status, coordinationStage, updatedAt }: InquiryPair & { updatedAt: string }) {
  return { status, coordinationStage: coordinationStage ?? null, updatedAt };
}

export async function changeInquiryStatus(p: Payload, user: NonNullable<Staff>, input: unknown) {
  const { id, action: operation, key, updatedAt: base, reason, next } = readCommand(input);
  return businessTransaction(p, async (req) => {
    const actor = await p.findByID({ collection: "staff", id: user.id, depth: 0, req });
    const current = await businessInquiry(p, actor, id, req).catch((error: unknown) => {
      if ([403, 404].includes((error as { status: number }).status))
        throw new ContentError("无权处理这条咨询，或咨询不存在", 403);
      throw error;
    });
    const action = `inquiry-state:${key}`;
    const details = { reason, operation, base };
    const prior = (
      await p.find({
        collection: "audit-events",
        depth: 0,
        limit: 1,
        req,
        where: {
          entity: { equals: "inquiries" },
          recordId: { equals: String(current.id) },
          action: { equals: action },
        },
      })
    ).docs[0];
    if (prior) {
      const after = prior.after as Record<string, unknown> | null;
      if (
        relationID(prior.actor) !== actor.id ||
        !after ||
        Object.entries({ ...details, ...next }).some(([field, value]) => after[field] !== value)
      )
        throw new ContentError("该操作编号已使用，请刷新后重新填写", 409);
      if (Object.entries(state(current)).some(([field, value]) => after[field] !== value))
        throw new ContentError("原操作已记录，咨询之后又有修改，请刷新后核对", 409);
      return { ...state(current), duplicate: true };
    }
    if (current.updatedAt !== base) throw new ContentError("咨询已被修改，请刷新后重新操作", 409);
    if (
      operation === "close"
        ? current.status === "closed" && current.coordinationStage === "closed"
        : !isInquiryClosed(current)
    )
      throw new ContentError("咨询已处于目标状态，请刷新后核对", 409);
    const saved = await p.update({
      collection: "inquiries",
      id: current.id,
      user: actor,
      req,
      overrideAccess: false,
      overrideLock: false,
      context: { inquiryStatusTransition: inquiryStatusToken, skipAudit: true },
      data: next,
    });
    const result = state(saved);
    await p.create({
      collection: "audit-events",
      user: actor,
      req,
      data: {
        entity: "inquiries",
        recordId: String(current.id),
        action,
        actor: actor.id,
        fields: "status, coordinationStage",
        before: { status: current.status, coordinationStage: current.coordinationStage ?? null },
        after: { ...result, ...details },
      },
    });
    return { ...result, duplicate: false };
  });
}
