"use client";
import { homeServices, homeTexts, type Housekeeping } from "@/lib/housekeeping";
import { homeText } from "@/lib/housekeeping-copy";
import { locales, localeNames } from "@/lib/locales";
export function HousekeepingFields({
  value: h,
  onChange,
}: {
  value: Housekeeping;
  onChange: (h: Housekeeping) => void;
}) {
  const set = (k: string, v: unknown) => onChange({ ...h, [k]: v });
  return (
    <section>
      <h3>家政公开资料</h3>
      <p>
        仅填写可公开的服务说明；住址、人员证件、合作报价及佣金不得放在这里。未知信息写明待确认。
      </p>
      <fieldset>
        <legend>可提供服务</legend>
        {homeServices.map((k) => (
          <label key={k}>
            <input
              type="checkbox"
              style={{ width: "auto" }}
              checked={h.services.includes(k)}
              onChange={(e) =>
                set(
                  "services",
                  e.target.checked ? [...h.services, k] : h.services.filter((v) => v !== k),
                )
              }
            />
            {homeText("zh", k)}
          </label>
        ))}
      </fieldset>
      {(["customerLanguages", "workerLanguages"] as const).map((k) => (
        <fieldset key={k}>
          <legend>{homeText("zh", k)}（仅选已核实语言；未知可留空）</legend>
          {locales.map((l) => (
            <label key={l} style={{ display: "inline-flex", margin: 8 }}>
              <input
                style={{ width: "auto" }}
                type="checkbox"
                checked={h[k].includes(l)}
                onChange={(e) =>
                  set(k, e.target.checked ? [...h[k], l] : h[k].filter((v) => v !== l))
                }
              />
              {localeNames[l]}
            </label>
          ))}
        </fieldset>
      ))}
      <label>
        工具用品由谁提供
        <select value={h.equipmentBy} onChange={(e) => set("equipmentBy", e.target.value)}>
          {["confirm", "provider", "customer"].map((k) => (
            <option key={k} value={k}>
              {homeText("zh", k)}
            </option>
          ))}
        </select>
      </label>
      <div className="form-grid">
        {homeTexts.map((k) => (
          <label key={k}>
            {homeText("zh", k)}
            <textarea rows={3} value={h[k]} onChange={(e) => set(k, e.target.value)} />
          </label>
        ))}
      </div>
    </section>
  );
}
