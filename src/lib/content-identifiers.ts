export const fixedContentPages = [
  { slug: "home", label: "首页" },
  { slug: "about", label: "关于" },
  { slug: "contact", label: "联系" },
  { slug: "partners", label: "伙伴" },
  { slug: "privacy", label: "隐私" },
  { slug: "terms", label: "条款" },
] as const;

export function fixedSlugForKey(key: string): string | undefined {
  return fixedContentPages.find(({ slug }) => key === `page-${slug}`)?.slug;
}

export function fixedPageKey(slug: string, existing: string[]): string | null {
  const canonical = `page-${slug}`;
  const keys = [...new Set(existing.filter(isContentIdentifier))];
  if (!keys.length || keys.includes(canonical)) return canonical;
  return keys.length === 1 ? keys[0] : null;
}

export function isContentIdentifier(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,99}$/.test(value);
}

export function contentSlug(title: string, fallback: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/\p{Mark}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-/, "")
    .slice(0, 100)
    .replace(/-$/, "");
  return /[a-z]/.test(slug) ? slug : fallback;
}

export function numberedContentSlug(base: string, number: number): string {
  const suffix = `-${number}`;
  return base.slice(0, 100 - suffix.length).replace(/-+$/, "") + suffix;
}
