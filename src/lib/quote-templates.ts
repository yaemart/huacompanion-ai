import { serviceSlugs } from "./routes.ts";

const fields = ["included", "excluded", "terms"] as const;
type QuoteTerms = Record<(typeof fields)[number], string>;
export type QuoteTemplate = QuoteTerms & { category: string };

export function quoteTemplates(value: unknown): (QuoteTemplate & { enabled: boolean })[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > serviceSlugs.length)
    throw Error("报价模板数量超出服务类型数量");
  const seen = new Set<string>();
  return value.map((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw Error("报价模板格式无效");
    const row = item as Record<string, unknown>;
    const { category, enabled } = row;
    if (typeof category !== "string" || !serviceSlugs.includes(category) || seen.has(category))
      throw Error("请选择有效服务类型，每类只能保存一份报价模板");
    if (enabled != null && typeof enabled !== "boolean") throw Error("模板启用状态无效");
    seen.add(category);
    const read = (field: keyof QuoteTerms) => {
      const text = row[field];
      if (typeof text !== "string" || !text.trim() || text.length > 4000)
        throw Error("三个模板文案均须填写，每项最多 4000 字符");
      return text.trim();
    };
    return {
      category,
      enabled: enabled === true,
      included: read("included"),
      excluded: read("excluded"),
      terms: read("terms"),
    };
  });
}

export function templatesForCategories(
  templates: ReturnType<typeof quoteTemplates>,
  categories: readonly string[],
): QuoteTemplate[] {
  return templates.flatMap(({ enabled, ...terms }) =>
    enabled && categories.includes(terms.category) ? [terms] : [],
  );
}

export function fillQuoteTerms<T extends QuoteTerms>(draft: T, template: QuoteTerms): T {
  const filled = { ...draft };
  for (const field of fields) if (!filled[field].trim()) filled[field] = template[field];
  return filled;
}
