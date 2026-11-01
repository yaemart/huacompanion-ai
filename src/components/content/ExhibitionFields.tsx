"use client";
import { catalogCities } from "@/lib/catalog-options";
import type { Exhibition } from "@/lib/exhibitions";

export const exhibitionIndustryLabels = {
  hardware: "五金",
  electrical: "电气",
  machinery: "机械",
  electronics: "电子",
  building: "建材",
  consumer: "消费品",
  other: "其他",
};
export const exhibitionStatusLabels = {
  pending: "待公布",
  announced: "已公布",
  postponed: "延期",
  cancelled: "取消",
  ended: "已结束",
};
const textFields = {
  edition: "届次／年份",
  venue: "场馆",
  address: "详细地址（中文／当地语言）",
  addressEn: "详细地址（英文）",
  audience: "适合观众",
  exhibits: "展品范围",
  admission: "门票／报名条件",
  unresolved: "待确认事项（将公开展示）",
};
export function ExhibitionFields({
  value,
  onChange,
  choices,
}: {
  value: Exhibition;
  onChange: (v: Exhibition) => void;
  choices: { contentKey: string; title: string }[];
}) {
  function set<K extends keyof Exhibition>(key: K, next: Exhibition[K]) {
    onChange({ ...value, [key]: next });
  }
  return (
    <section>
      <h2>展会资料</h2>
      <div className="row">
        <label>
          举办城市
          <select value={value.city} onChange={(e) => set("city", e.target.value)}>
            <option value="">请选择城市</option>
            {catalogCities.map((c) => (
              <option key={c.code} value={c.code}>
                {c.zh}
              </option>
            ))}
          </select>
        </label>
        <label>
          展会状态
          <select
            value={value.status}
            onChange={(e) => set("status", e.target.value as Exhibition["status"])}
          >
            {Object.entries(exhibitionStatusLabels).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p>状态独立于发布审核。结束日期过后按北京时间显示“已结束”；取消和延期保留人工状态。</p>
      <div className="row">
        <label>
          开始日期
          <input
            type="date"
            value={value.startDate}
            onChange={(e) => set("startDate", e.target.value)}
          />
        </label>
        <label>
          结束日期
          <input
            type="date"
            value={value.endDate}
            onChange={(e) => set("endDate", e.target.value)}
          />
        </label>
      </div>
      <small>只有待公布或延期可以将两个日期同时留空；日期已知时请完整填写。</small>
      <fieldset>
        <legend>所属行业（可多选）</legend>
        {Object.entries(exhibitionIndustryLabels).map(([code, label]) => (
          <label key={code} style={{ display: "inline-flex", gap: 8, marginRight: 20 }}>
            <input
              type="checkbox"
              style={{ width: "auto" }}
              checked={value.industries.includes(code)}
              onChange={(e) =>
                set(
                  "industries",
                  e.target.checked
                    ? [...value.industries, code]
                    : value.industries.filter((x) => x !== code),
                )
              }
            />
            {label}
          </label>
        ))}
      </fieldset>
      {Object.entries(textFields).map(([key, label]) => (
        <label key={key}>
          {label}
          <textarea
            value={value[key as keyof typeof textFields]}
            onChange={(e) => set(key as keyof typeof textFields, e.target.value)}
          />
        </label>
      ))}
      <label>
        官方网站
        <input
          type="url"
          placeholder="https://…"
          value={value.officialURL}
          onChange={(e) => set("officialURL", e.target.value)}
        />
      </label>
      <label>
        官方报名网址（可选）
        <input
          type="url"
          placeholder="https://…"
          value={value.registrationURL}
          onChange={(e) => set("registrationURL", e.target.value)}
        />
      </label>
      <label>
        最后人工核实日期
        <input
          type="date"
          value={value.verifiedAt}
          onChange={(e) => set("verifiedAt", e.target.value)}
        />
      </label>
      <small>
        发布前请在下方“来源”中添加与官方网站完全一致的网址，并填写与最后人工核实日期一致的核查日期。不得将计划核查日期当作已核实。
      </small>
      <label>
        关联华伴服务项目（当前语言，可多选）
        <select
          multiple
          value={value.projectKeys}
          onChange={(e) =>
            set(
              "projectKeys",
              Array.from(e.target.selectedOptions, (o) => o.value),
            )
          }
        >
          {choices.map((d) => (
            <option key={d.contentKey} value={d.contentKey}>
              {d.title} · {d.contentKey}
            </option>
          ))}
          {value.projectKeys
            .filter((key) => !choices.some((d) => d.contentKey === key))
            .map((key) => (
              <option key={key} value={key}>
                找不到当前语言项目：{key}（请复核）
              </option>
            ))}
        </select>
      </label>
      <small>
        可关联工作稿；公众页面仅展示符合公开条件的正式项目。使用 Ctrl／Command 多选或取消选择。
      </small>
    </section>
  );
}
