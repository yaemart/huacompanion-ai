import { type Exhibition, validateExhibition, publicExhibition } from "./exhibitions.ts";
import { isLocale, type Locale } from "./locales.ts";
import {
  type Catalog,
  isCatalog,
  validateCatalog,
  publicCatalog,
} from "./catalog.ts";
export type ContentUser =
  { id?: number | string; role?: string } | null | undefined;
export const canEditContent = (user: ContentUser) =>
  !!user && ["admin", "editor"].includes(user.role || "");
export type Block = {
  type: "heading" | "paragraph" | "list" | "image" | "link";
  text?: string;
  url?: string;
  mediaId?: number;
};
export type Source = {
  id: string;
  title: string;
  url: string;
  checkedAt?: string;
};
export type ContentBody = {
  contentKey: string;
  kind:
    | "service"
    | "guide"
    | "faq"
    | "page"
    | "partner"
    | "provider-profile"
    | "service-project"
    | "exhibition";
  locale: Locale;
  slug: string;
  title: string;
  summary?: string;
  blocks: Block[];
  sources: Source[];
  catalog?: Catalog;
  exhibition?: Exhibition;
  acceptingInquiries?: boolean;
  category?: number;
  order?: number;
  author?: string;
  publishedAt?: string;
  expiresAt?: string;
  seoTitle?: string;
  seoDescription?: string;
};
export function safeURL(value: unknown) {
  try {
    const u = new URL(String(value));
    return (
      ["https:", "http:"].includes(u.protocol) && !u.username && !u.password
    );
  } catch {
    return false;
  }
}
function checkBlocks(blocks: unknown) {
  if (!Array.isArray(blocks) || blocks.length > 200)
    throw Error("正文格式无效");
  for (const b of blocks) {
    if (
      !b ||
      !["heading", "paragraph", "list", "image", "link"].includes(b.type)
    )
      throw Error("不支持的正文类型");
    if (b.type === "image") {
      if (!Number.isSafeInteger(b.mediaId) || b.mediaId < 1)
        throw Error("请选择图片");
    } else if (typeof b.text !== "string" || b.text.length > 10000)
      throw Error("正文过长或无效");
    if (b.type === "link" && !safeURL(b.url))
      throw Error("链接必须为 http/https");
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
    ].includes(d.kind) ||
    !isLocale(d.locale)
  )
    throw Error("内容类型或语言无效");
  if (
    !/^[a-z0-9][a-z0-9-]{0,99}$/.test(d.slug) ||
    !/^[a-z0-9][a-z0-9-]{0,99}$/.test(d.contentKey)
  )
    throw Error("网址标识只允许小写英文、数字和连字符");
  if (
    !d.title?.trim() ||
    d.title.length > 200 ||
    (d.summary?.length || 0) > 2000
  )
    throw Error("请填写有效标题与摘要");
  if (
    d.kind === "page" &&
    !["home", "about", "contact", "partners", "privacy", "terms"].includes(
      d.slug,
    )
  )
    throw Error("网站页面仅支持 home/about/contact/partners/privacy/terms");
  if (isCatalog(d.kind)) validateCatalog(d.kind, d.catalog);
  if (d.kind === "exhibition") validateExhibition(d.exhibition);
  checkBlocks(d.blocks);
  if (!Array.isArray(d.sources) || d.sources.length > 30)
    throw Error("来源格式无效");
  const ids = new Set();
  for (const s of d.sources) {
    if (!s.id || ids.has(s.id) || !s.title || !safeURL(s.url))
      throw Error("来源需要唯一编号、标题和有效网址");
    ids.add(s.id);
  }
  if (
    d.category !== undefined &&
    (!Number.isInteger(d.category) || d.category < 0 || d.category > 8)
  )
    throw Error("分类无效");
}
export type Candidate = {
  title: string;
  summary?: string;
  blocks: Block[];
  sourceIds: string[];
  questions: string[];
};
export function validateCandidate(
  value: unknown,
  allowed: string[],
): asserts value is Candidate {
  const r = value as Candidate;
  if (
    !r ||
    typeof r.title !== "string" ||
    !r.title.trim() ||
    r.title.length > 200
  )
    throw Error("AI标题无效");
  checkBlocks(r.blocks);
  if (r.blocks.some((b) => b.type === "image"))
    throw Error("AI不能自行引用图片");
  if (
    !Array.isArray(r.sourceIds) ||
    r.sourceIds.some((id) => !allowed.includes(id))
  )
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
    ...(d.kind === "exhibition" && d.exhibition ? { exhibition: publicExhibition(d.exhibition) } : {}),
    ...(isCatalog(d.kind) && d.catalog
      ? { catalog: publicCatalog(d.catalog, d.locale) }
      : {}),
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
    })),
    sources: d.sources.map((s) => ({
      id: s.id,
      title: s.title,
      url: s.url,
      checkedAt: s.checkedAt,
    })),
    category: d.category || 0,
    order: d.order || 0,
    author: d.author || "",
    seoTitle: (d.seoTitle || "").slice(0, 200),
    seoDescription: (d.seoDescription || "").slice(0, 500),
    expiresAt: d.expiresAt || undefined,
  };
}
