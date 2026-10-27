export const contentSections = [
  {
    id: 1,
    key: "preparation",
    zh: "来华准备",
    en: "Before your visit",
    description: {
      zh: "行前清单、官方信息入口与沟通准备",
      en: "Preparation checklists, official information and communication",
    },
  },
  {
    id: 2,
    key: "business",
    zh: "商务与展会",
    en: "Business & exhibitions",
    description: {
      zh: "商务访问、五金电器采购、展会与工厂沟通",
      en: "Business visits, hardware and electrical sourcing, exhibitions and factory meetings",
    },
  },
  {
    id: 3,
    key: "medical",
    zh: "医疗就诊协调",
    en: "Medical visit coordination",
    description: {
      zh: "预约准备、翻译陪同与服务责任边界",
      en: "Appointment preparation, language support and coordination boundaries",
    },
  },
  {
    id: 4,
    key: "transport",
    zh: "抵达与交通",
    en: "Arrival & transport",
    description: {
      zh: "接机、行李、跨城衔接与特殊需求",
      en: "Pickups, luggage, connecting journeys and access needs",
    },
  },
  {
    id: 5,
    key: "stays",
    zh: "住宿与生活",
    en: "Stays & everyday life",
    description: {
      zh: "短住长租、入住准备、通信与支付使用指引",
      en: "Short and long stays, check-in preparation and everyday essentials",
    },
  },
  {
    id: 6,
    key: "culture",
    zh: "旅游与文化",
    en: "Travel & culture",
    description: {
      zh: "上海及周边、家庭出行与文化体验准备",
      en: "Shanghai and nearby trips, family travel and cultural experiences",
    },
  },
  {
    id: 7,
    key: "language",
    zh: "翻译与陪同",
    en: "Interpretation & accompaniment",
    description: {
      zh: "场景选择、材料准备与费用范围",
      en: "Choosing support, preparing materials and agreeing scope",
    },
  },
  {
    id: 8,
    key: "service-process",
    zh: "华伴服务说明",
    en: "How Hua Companion works",
    description: {
      zh: "咨询、方案、报价、变更与常见问题",
      en: "Enquiries, proposals, quotes, changes and common questions",
    },
  },
] as const;
export function sectionFor(body: {
  category?: number;
  kind?: string;
  slug?: string;
}) {
  if (body.category && contentSections.some((s) => s.id === body.category))
    return body.category;
  const mapping: Record<string, number> = {
    business: 2,
    medical: 3,
    transport: 4,
    stays: 5,
    travel: 6,
    interpretation: 7,
    arrival: 1,
  };
  return body.kind === "service" ? mapping[body.slug || ""] || 8 : 8;
}
export function filterContent<
  T extends {
    title?: string;
    slug?: string;
    locale?: string;
    reviewState?: string;
    body?: { category?: number; kind?: string; slug?: string };
  },
>(
  rows: T[],
  filters: {
    section?: number;
    locale?: string;
    state?: string;
    query?: string;
  },
) {
  return rows.filter(
    (d) =>
      (!filters.section || sectionFor(d.body || {}) === filters.section) &&
      (!filters.locale || d.locale === filters.locale) &&
      (!filters.state || d.reviewState === filters.state) &&
      (!filters.query ||
        `${d.title || ""} ${d.slug || ""}`
          .toLowerCase()
          .includes(filters.query.toLowerCase())),
  );
}
