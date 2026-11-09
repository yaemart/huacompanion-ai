import { homeText } from "./housekeeping-copy.ts";
import { homeRequestFields, homeProviderFields } from "./housekeeping.ts";
import { catalogLanguages } from "./catalog-options.ts";

const labels: Record<string, string> = {
  ...Object.fromEntries(
    [...homeRequestFields, ...homeProviderFields].map((key) => [key, homeText("zh", key)]),
  ),
  categories: "服务类别",
  organisation: "机构名称",
  city: "城市／服务区域",
  people: "人数",
  arrivalDate: "预计来华日期",
  datesUnknown: "日期尚未确定",
  industry: "行业／产品",
  purpose: "展会或访问目的",
  flight: "航班／车次",
  pickup: "上车地点",
  dropoff: "下车地点",
  luggage: "行李／用车需求",
  stayType: "住宿类型",
  checkIn: "入住日期",
  checkOut: "退房日期",
  area: "偏好区域",
  facilities: "房型与设施",
  leaseLength: "预计租期",
  rentalNeeds: "租赁与入住需求",
  destinations: "目的地",
  interests: "兴趣与同行情况",
  interpretation: "翻译语言与场景",
  arrivalHelp: "需要的生活协助",
  medicalHelp: "协调需求（请勿填写病史）",
  budget: "预算范围与币种",
  description: "其他需求说明",
  name: "联系人姓名",
  email: "电子邮箱",
  phone: "电话",
  contact: "其他联系方式",
  language: "沟通语言",
  channel: "首选联系渠道",
  website: "官网或公开介绍链接",
  languages: "支持语言",
  capabilities: "服务能力",
  hours: "营业时段",
  cooperation: "合作方式",
  qualification: "资质类型与编号",
  notes: "补充说明",
  consent: "已确认隐私告知",
};
const categories: Record<string, string> = {
  housekeeping: "家政与居家服务",
  medical: "医疗机构对接",
  business: "展会与商务访问",
  transport: "接送机与交通",
  stays: "酒店与长期住宿",
  travel: "旅游机构对接",
  interpretation: "翻译与陪同",
  arrival: "来华准备与生活协助",
};
function lookup(table: Record<string, string>, value: string): string {
  return Object.hasOwn(table, value) ? table[value] : value;
}
function text(key: string, value: string): string {
  if (key === "categories") return lookup(categories, value);
  if (key === "stayType") return lookup({ short: "短期住宿", long: "长期住宿" }, value);
  if (key === "channel")
    return lookup({ email: "电子邮件", whatsapp: "WhatsApp", wechat: "微信" }, value);
  if (key === "homeServices")
    return value
      .split(",")
      .map((v) => text("homeService", v))
      .join("、");
  if (
    ["homeService", "homeFlexible", "homeFrequency", "homeEquipment", "homeEntity"].includes(key) &&
    [
      "regular",
      "deep",
      "move-in",
      "yes",
      "no",
      "once",
      "recurring",
      "provider",
      "customer",
      "confirm",
      "company",
      "team",
      "other",
    ].includes(value)
  )
    return homeText("zh", value);
  if (["language", "languages"].includes(key))
    return catalogLanguages.find((l) => l.code === value)?.zh ?? value;
  return value;
}
export function intakeDetailRows(value: unknown): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  function visit(value: unknown, label: string, key: string) {
    if (value === null || value === undefined || value === "") return;
    if (Array.isArray(value)) {
      if (value.every((v) => ["string", "number", "boolean"].includes(typeof v))) {
        if (value.length) rows.push({ label, value: value.map((v) => scalar(v, key)).join("、") });
      } else value.forEach((v, i) => visit(v, `${label} · 第 ${i + 1} 项`, key));
    } else if (typeof value === "object") {
      for (const [child, v] of Object.entries(value))
        visit(v, `${label} · ${lookup(labels, child)}`, child);
    } else rows.push({ label, value: scalar(value, key) });
  }
  function scalar(value: unknown, key: string): string {
    if (typeof value === "boolean") return value ? "是" : "否";
    return text(key, String(value));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, v] of Object.entries(value))
      visit(v, Object.hasOwn(labels, key) ? labels[key] : `其他资料（${key}）`, key);
  } else visit(value, "原始资料", "");
  return rows;
}
