"use client";
import { exhibitionPhaseLimit, type ExhibitionPhase } from "@/lib/exhibitions";
import { exhibitionExamples } from "@/lib/content-field-examples-copy";
import { ContentTextField } from "./ContentTextField";

export function ExhibitionPhaseFields({
  value,
  onChange,
  locale,
}: {
  value: ExhibitionPhase[];
  onChange: (value: ExhibitionPhase[]) => void;
  locale: string;
}) {
  function change(index: number, key: keyof ExhibitionPhase, text: string) {
    onChange(value.map((phase, i) => (i === index ? { ...phase, [key]: text } : phase)));
  }
  return (
    <fieldset>
      <legend>展会分期（最多 {exhibitionPhaseLimit} 期，可选）</legend>
      <p>
        分期仅供说明，总体展期仍决定筛选与结束状态；已知分期日期须在总体展期内。日期可同时留空。
      </p>
      {value.map((phase, index) => (
        <fieldset key={index}>
          <legend>第 {index + 1} 期</legend>
          <label>
            分期名称
            <input
              value={phase.name}
              maxLength={200}
              onChange={(e) => change(index, "name", e.target.value)}
            />
          </label>
          <div className="row">
            {(["startDate", "endDate"] as const).map((key) => (
              <label key={key}>
                {key === "startDate" ? "本期开始日期" : "本期结束日期"}
                <input
                  type="date"
                  value={phase[key]}
                  onChange={(e) => change(index, key, e.target.value)}
                />
              </label>
            ))}
          </div>
          <ContentTextField
            label="本期题材"
            value={phase.theme}
            onChange={(text) => change(index, "theme", text)}
            examples={exhibitionExamples.exhibits}
            locale={locale}
          />
          <button type="button" onClick={() => onChange(value.filter((_, i) => i !== index))}>
            删除第 {index + 1} 期
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        disabled={value.length >= exhibitionPhaseLimit}
        onClick={() => onChange([...value, { name: "", startDate: "", endDate: "", theme: "" }])}
      >
        添加分期
      </button>
      <small>发布前请补齐每期名称和题材，或删除空白分期；不会自动推导总体日期或生成提醒。</small>
    </fieldset>
  );
}
