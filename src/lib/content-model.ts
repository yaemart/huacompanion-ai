import { publicPolicy, type PublicPolicyData } from "./immigration-policy.ts";
import { parsePolicyBannerBlock } from "./immigration-policy-banner.ts";
import { homeTexts } from "./housekeeping.ts";
import {
  type Lifestyle,
  lifeTranslationFields,
  isLife,
  validateLifestyle,
  publicLifestyle,
} from "./lifestyle.ts";
import { type Institution, validateInstitution, publicInstitution } from "./institutions.ts";
import { type Exhibition, validateExhibition, publicExhibition } from "./exhibitions.ts";
import { isLocale, type Locale } from "./locales.ts";
import { type Catalog, isCatalog, validateCatalog, publicCatalog } from "./catalog.ts";
import { hasRole, isAdmin, type Staff } from "../cms/access.ts";
import { fixedContentPages, isContentIdentifier } from "./content-identifiers.ts";
import { isSourceTopic, type SourceTopic } from "./content-source-verification.ts";
import { StaffFormError } from "./staff-form-feedback.ts";
export type ContentUser = Staff;
export const canEditContent = (user: ContentUser) => isAdmin(user) || hasRole(user, "editor");
export type Block = {
  type: "heading" | "paragraph" | "list" | "image" | "link" | "policy-banner";
  text?: string;
  url?: string;
  mediaId?: number;
  policyUnconfirmed?: boolean;
};
export type Source = {
  id: string;
  title: string;
  url: string;
  checkedAt?: string;
};
export type ContentBody = {
  qualityReview?: { checkedAt?: string; nextReviewAt?: string };
  contentKey: string;
  kind:
    | "service"
    | "guide"
    | "faq"
    | "page"
    | "partner"
    | "provider-profile"
    | "service-project"
    | "exhibition"
    | "institution"
    | "venue"
    | "activity"
    | "immigration-policy";
  locale: Locale;
  slug: string;
  title: string;
  summary?: string;
  blocks: Block[];
  sources: Source[];
  sourceTopic?: SourceTopic;
  policyRef?: { id: number; revision: number };
  policy?: PublicPolicyData;
  catalog?: Catalog;
  exhibition?: Exhibition;
  institution?: Institution;
  lifestyle?: Lifestyle;
  acceptingInquiries?: boolean;
  category?: number;
  order?: number;
  author?: string;
  publishedAt?: string;
  publicationRevision?: number;
  expiresAt?: string;
  seoTitle?: string;
  seoDescription?: string;
  seoImage?: number;
};
export function safeURL(value: unknown) {
  try {
    const u = new URL(String(value));
    return ["https:", "http:"].includes(u.protocol) && !u.username && !u.password;
  } catch {
    return false;
  }
}
function checkBlocks(blocks: unknown) {
  if (!Array.isArray(blocks) || blocks.length > 200)
    throw new StaffFormError("请在「正文」中填写内容。正文最多 200 段，超出时请拆成多篇。");
  for (const [index, b] of blocks.entries()) {
    const where = `正文第 ${index + 1} 段`;
    if (!b || !["heading", "paragraph", "list", "image", "link", "policy-banner"].includes(b.type))
      throw new StaffFormError(`${where}无法识别，请移除这一段并重新添加。`);
    if (b.type === "policy-banner") {
      if (!parsePolicyBannerBlock(b))
        throw new StaffFormError(
          `${where}的政策横幅未填完整，请选择已发布政策并检查待确认时的显示选项。`,
        );
    } else if (b.type === "image") {
      if (!Number.isSafeInteger(b.mediaId) || b.mediaId < 1)
        throw new StaffFormError(`请为${where}选择一张图片，或移除该图片段。`);
    } else if (typeof b.text !== "string" || b.text.length > 10000)
      throw new StaffFormError(`${where}最多 10,000 字，请缩短或分段后保存。`);
    if (b.type === "link" && !safeURL(b.url))
      throw new StaffFormError(`请为${where}填写以 https:// 或 http:// 开头的完整网址。`);
  }
}
export function validateContent(value: unknown): asserts value is ContentBody {
  const d = value as ContentBody;
  if (
    !d ||
    ![
      "service",
      "guide",
      "faq",
      "page",
      "partner",
      "provider-profile",
      "service-project",
      "exhibition",
      "institution",
      "venue",
      "activity",
      "immigration-policy",
    ].includes(d.kind) ||
    !isLocale(d.locale)
  )
    throw new StaffFormError("请重新选择内容类型和语言，再保存草稿。");
  if (typeof d.title !== "string" || !d.title.trim())
    throw new StaffFormError("请填写「标题」后再保存草稿。");
  if (d.title.length > 200) throw new StaffFormError("「标题」最多 200 字，请缩短后再保存。");
  if ((d.summary?.length || 0) > 2000)
    throw new StaffFormError("「摘要」最多 2,000 字，请缩短后再保存。");
  if (!isContentIdentifier(d.slug) || !isContentIdentifier(d.contentKey))
    throw new StaffFormError(
      "请在「高级」检查内容编号和网址末尾。以小写字母或数字开头，只用小写英文字母、数字和短横线，最多 100 字。",
    );
  if (d.seoImage !== undefined && (!Number.isSafeInteger(d.seoImage) || d.seoImage < 1))
    throw new StaffFormError("请选择可用的「分享图片」，或清空后保存。");
  if (d.kind === "page" && !fixedContentPages.some((page) => page.slug === d.slug))
    throw new StaffFormError("请在「网站页面」选择已有页面，再保存草稿。");
  if (isCatalog(d.kind)) validateCatalog(d.kind, d.catalog);
  if (d.kind === "exhibition") validateExhibition(d.exhibition);
  if (isLife(d.kind)) validateLifestyle(d.lifestyle, d.kind);
  if (d.kind === "institution") validateInstitution(d.institution);
  checkBlocks(d.blocks);
  if (d.sourceTopic !== undefined && !isSourceTopic(d.sourceTopic))
    throw new StaffFormError("请在「资料来源」重新选择资料主题。");
  if (!Array.isArray(d.sources) || d.sources.length > 30)
    throw new StaffFormError("「资料来源」最多填写 30 条，请移除多余来源后再保存。");
  const ids = new Set();
  for (const [index, s] of d.sources.entries()) {
    const where = `「资料来源」第 ${index + 1} 条`;
    if (!s?.id || ids.has(s.id)) throw new StaffFormError(`${where}无法保存，请移除后重新添加。`);
    if (!s.title) throw new StaffFormError(`请填写${where}的「来源标题」。`);
    if (!safeURL(s.url))
      throw new StaffFormError(`${where}的「来源网址」请填以 https:// 或 http:// 开头的完整网址。`);
    ids.add(s.id);
  }
  if (
    d.category !== undefined &&
    (!Number.isInteger(d.category) || d.category < 0 || d.category > 8)
  )
    throw new StaffFormError("请重新选择内容分类，再保存草稿。");
}
export type Candidate = {
  title: string;
  summary?: string;
  blocks: Block[];
  sourceIds: string[];
  questions: string[];
  housekeepingText?: Partial<Record<(typeof homeTexts)[number], string>>;
  lifestyleText?: Partial<Record<(typeof lifeTranslationFields)[number], string>>;
};
export function validateCandidate(value: unknown, allowed: string[]): asserts value is Candidate {
  const r = value as Candidate;
  if (!r || typeof r.title !== "string" || !r.title.trim() || r.title.length > 200)
    throw Error("AI标题无效");
  if (r.housekeepingText !== undefined) {
    if (
      !r.housekeepingText ||
      typeof r.housekeepingText !== "object" ||
      Array.isArray(r.housekeepingText)
    )
      throw Error("家政翻译格式无效");
    for (const [k, v] of Object.entries(r.housekeepingText))
      if (!(homeTexts as readonly string[]).includes(k) || typeof v !== "string" || v.length > 5000)
        throw Error("家政翻译仅允许公开文字字段");
  }
  if (r.lifestyleText !== undefined) {
    if (!r.lifestyleText || typeof r.lifestyleText !== "object" || Array.isArray(r.lifestyleText))
      throw Error("AI结构化翻译格式无效");
    for (const [k, v] of Object.entries(r.lifestyleText))
      if (
        !(lifeTranslationFields as readonly string[]).includes(k) ||
        typeof v !== "string" ||
        v.length > 5000
      )
        throw Error("AI仅可翻译允许的文字字段");
  }
  checkBlocks(r.blocks);
  if (r.blocks.some((b) => b.type === "image" || b.type === "policy-banner"))
    throw Error("AI不能自行引用图片或政策横幅");
  if (!Array.isArray(r.sourceIds) || r.sourceIds.some((id) => !allowed.includes(id)))
    throw Error("AI引用了未提供的来源");
  if (
    !Array.isArray(r.questions) ||
    r.questions.some((q) => typeof q !== "string" || q.length > 2000)
  )
    throw Error("待确认问题无效");
  if (JSON.stringify(r).length > 40000) throw Error("AI结果过长");
}
export function publicBody(d: ContentBody): ContentBody {
  return {
    ...(d.kind === "immigration-policy" && d.policy ? { policy: publicPolicy(d.policy) } : {}),
    ...(isLife(d.kind) && d.lifestyle ? { lifestyle: publicLifestyle(d.lifestyle) } : {}),
    ...(d.kind === "institution" && d.institution
      ? { institution: publicInstitution(d.institution) }
      : {}),
    ...(d.kind === "exhibition" && d.exhibition
      ? { exhibition: publicExhibition(d.exhibition) }
      : {}),
    ...(isCatalog(d.kind) && d.catalog ? { catalog: publicCatalog(d.catalog, d.locale) } : {}),
    contentKey: d.contentKey,
    kind: d.kind,
    locale: d.locale,
    slug: d.slug,
    title: d.title,
    summary: d.summary || "",
    blocks: d.blocks.map((b) => ({
      type: b.type,
      text: b.text,
      url: b.url,
      mediaId: b.mediaId,
      ...(b.type === "policy-banner" ? { policyUnconfirmed: b.policyUnconfirmed === true } : {}),
    })),
    sources: d.sources.map((s) => ({
      id: s.id,
      title: s.title,
      url: s.url,
      checkedAt: s.checkedAt,
    })),
    ...(d.sourceTopic ? { sourceTopic: d.sourceTopic } : {}),
    category: d.category || 0,
    order: d.order || 0,
    author: d.author || "",
    seoTitle: (d.seoTitle || "").slice(0, 200),
    seoDescription: (d.seoDescription || "").slice(0, 500),
    ...(d.seoImage ? { seoImage: d.seoImage } : {}),
    expiresAt: d.expiresAt || undefined,
  };
}
