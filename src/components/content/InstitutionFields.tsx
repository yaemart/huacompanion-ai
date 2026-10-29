"use client";
import { catalogCities, catalogLanguages } from "@/lib/catalog-options";
import type { Institution } from "@/lib/institutions";

export const institutionTypeLabels: Record<string, string> = {
  medical: "医疗机构",
  rehabilitation: "康复机构",
  wellness: "康养机构",
};
export const institutionAcceptanceLabels: Record<string, string> = {
  pending: "待确认",
  confirmed: "已确认接待",
  paused: "暂停接待",
};
const textFields = {
  address: "详细地址（中文／当地语言）",
  addressEn: "详细地址（英文）",
  directions: "服务方向",
  audience: "适合人群",
  appointment: "预约方式与条件",
  preparation: "到访准备",
  fees: "费用说明",
  acceptanceConditions: "外籍访客接待条件",
  interpretation: "口译支持说明",
  qualification: "公开资质核验说明",
  unresolved: "待确认事项（公开）",
} as const;
export function InstitutionFields({
  value,
  onChange,
  choices,
}: {
  value: Institution;
  onChange: (value: Institution) => void;
  choices: { contentKey: string; title: string }[];
}) {
  function set<K extends keyof Institution>(key: K, next: Institution[K]) {
    onChange({ ...value, [key]: next });
  }
  return (
    <section>
      <h2>医疗与康养机构资料</h2>
      <div className="row">
        <label>
          机构类型
          <select
            value={value.type}
            onChange={(e) => set("type", e.target.value as Institution["type"])}
          >
            {Object.entries(institutionTypeLabels).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          所在城市
          <select
            value={value.city}
            onChange={(e) => set("city", e.target.value)}
          >
            <option value="">请选择城市</option>
            {catalogCities.map((c) => (
              <option key={c.code} value={c.code}>
                {c.zh}
              </option>
            ))}
          </select>
        </label>
        <label>
          外籍访客接待状态
          <select
            value={value.foreignAcceptance}
            onChange={(e) =>
              set(
                "foreignAcceptance",
                e.target.value as Institution["foreignAcceptance"],
              )
            }
          >
            {Object.entries(institutionAcceptanceLabels).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p>
        接待状态与发布状态独立。待确认不等于不接待；只有已确认接待的公开机构可以提交机构咨询。
      </p>
      <fieldset>
        <legend>机构可提供的服务语言（与此篇内容语言独立）</legend>
        {catalogLanguages.map((l) => (
          <label
            key={l.code}
            style={{ display: "inline-flex", gap: 8, marginRight: 20 }}
          >
            <input
              type="checkbox"
              style={{ width: "auto" }}
              checked={value.languages.includes(l.code)}
              onChange={(e) =>
                set(
                  "languages",
                  e.target.checked
                    ? [...value.languages, l.code]
                    : value.languages.filter((v) => v !== l.code),
                )
              }
            />
            {l.zh}
          </label>
        ))}
      </fieldset>
      <small>
        只勾选已核实的语言；留空表示尚未确认，不代表支持所有语言。华伴口译安排请写在口译支持说明中。
      </small>
      {Object.entries(textFields).map(([key, label]) => (
        <label key={key}>
          {label}
          <textarea
            value={value[key as keyof typeof textFields]}
            onChange={(e) =>
              set(key as keyof typeof textFields, e.target.value)
            }
          />
        </label>
      ))}
      <small>
        以上字段均会公开。资质核验说明须依据官方资料，不可作未经核实的资质或疗效保证；内部联系人、合同与私有核验材料请仅存入内部合作档案。
      </small>
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
        最后人工核实日期
        <input
          type="date"
          value={value.verifiedAt}
          onChange={(e) => set("verifiedAt", e.target.value)}
        />
      </label>
      <small>
        下方来源需包含与官方网站完全一致的网址，以及与此日期一致的实际人工核查日期。
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
        可关联工作稿；公开页面仅展示符合公开条件的正式项目。使用 Ctrl／Command
        多选或取消选择。
      </small>
    </section>
  );
}
