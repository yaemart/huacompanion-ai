"use client";
import { lifeCategories, lifeTextFields, type Lifestyle, type LifeKind } from "@/lib/lifestyle";
import { lifeText } from "@/lib/lifestyle-copy";
import { catalogCities, catalogLanguages } from "@/lib/catalog-options";
const extra: Record<string, string> = {
  subcategory: "子分类",
  tags: "标签（逗号分隔）",
  district: "区域",
  mapURL: "地图网址",
  currency: "币种（例如 CNY）",
  priceUnit: "计价单位（每人／每桌／每场）",
  officialURL: "官方来源网址",
  verifiedAt: "最后人工核实日期",
  reviewDue: "下次复核日期",
  venueKey: "关联场所编号",
  menuURL: "官方菜单网址",
};
const activityFields = [
  "startAt",
  "endAt",
  "deadline",
  "organizer",
  "venueKey",
  "participation",
  "refunds",
];
const diningFields = [
  "cuisine",
  "specialties",
  "menuURL",
  "menuLanguages",
  "diningScenes",
  "facilities",
  "dietary",
  "dietaryEvidence",
];
export function LifestyleFields({
  value: v,
  kind,
  onChange,
}: {
  value: Lifestyle;
  kind: LifeKind;
  onChange: (v: Lifestyle) => void;
}) {
  const set = (key: string, value: unknown) => onChange({ ...v, [key]: value });
  return (
    <section>
      <h3>{kind === "venue" ? "体验场所与餐馆" : "体验活动"}资料</h3>
      <p>未知事实请说明“待确认”。服务语言、饮食能力、营业时间需核实。活动时间均为中国时间。</p>
      <div className="form-grid">
        <label>
          分类
          <select value={v.category} onChange={(e) => set("category", e.target.value)}>
            {lifeCategories.map((k) => (
              <option key={k} value={k}>
                {lifeText("zh", k)}
              </option>
            ))}
          </select>
        </label>
        <label>
          营业／活动状态
          <select value={v.status} onChange={(e) => set("status", e.target.value)}>
            {(kind === "venue"
              ? ["open", "paused", "closed"]
              : ["scheduled", "full", "cancelled", "postponed", "ended"]
            ).map((k) => (
              <option key={k} value={k}>
                {lifeText("zh", k)}
              </option>
            ))}
          </select>
        </label>
        <label>
          城市
          <select value={v.city} onChange={(e) => set("city", e.target.value)}>
            <option value="">请选择</option>
            {catalogCities.map((c) => (
              <option key={c.code} value={c.code}>
                {c.zh}
              </option>
            ))}
          </select>
        </label>
        {lifeTextFields
          .filter(
            (k) =>
              k !== "city" &&
              !(kind === "venue" && activityFields.includes(k)) &&
              !(kind === "activity" && k === "hours") &&
              !(v.category !== "dining" && diningFields.includes(k)),
          )
          .map((k) => (
            <label key={k}>
              {extra[k] || lifeText("zh", k)}
              {["startAt", "endAt", "deadline"].includes(k) ? (
                <input
                  type="datetime-local"
                  value={v[k].replace("+08:00", "")}
                  onChange={(e) => set(k, e.target.value ? e.target.value + "+08:00" : "")}
                />
              ) : ["verifiedAt", "reviewDue"].includes(k) ? (
                <input type="date" value={v[k]} onChange={(e) => set(k, e.target.value)} />
              ) : (
                <textarea rows={2} value={v[k]} onChange={(e) => set(k, e.target.value)} />
              )}
            </label>
          ))}
        {(["priceMin", "priceMax"] as const).map((k) => (
          <label key={k}>
            {k === "priceMin" ? "参考最低价格" : "参考最高价格"}
            <input
              type="number"
              min="0"
              step="0.01"
              value={v[k] ?? ""}
              onChange={(e) => set(k, e.target.value === "" ? null : Number(e.target.value))}
            />
          </label>
        ))}
        <label>
          关联华伴项目编号（逗号分隔）
          <input
            value={v.projectKeys.join(",")}
            onChange={(e) =>
              set(
                "projectKeys",
                e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
          />
        </label>
      </div>
      <fieldset>
        <legend>已核实现场沟通语言（不代表菜单语言）</legend>
        {catalogLanguages.map((l) => (
          <label key={l.code} style={{ display: "inline-flex", gap: 8, margin: 8 }}>
            <input
              type="checkbox"
              style={{ width: "auto" }}
              checked={v.languages.includes(l.code)}
              onChange={(e) =>
                set(
                  "languages",
                  e.target.checked
                    ? [...v.languages, l.code]
                    : v.languages.filter((k) => k !== l.code),
                )
              }
            />
            {l.zh}
          </label>
        ))}
      </fieldset>
    </section>
  );
}
