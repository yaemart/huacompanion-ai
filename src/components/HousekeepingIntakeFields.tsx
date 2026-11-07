"use client";
import type { Locale } from "@/lib/locales";
import type { Values } from "@/lib/forms";
import { homeText } from "@/lib/housekeeping-copy";
import { homeRequestFields, homeProviderFields, homeServices } from "@/lib/housekeeping";
export function HousekeepingIntakeFields({
  kind,
  locale,
  values,
  set,
  errors,
}: {
  kind: "request" | "apply";
  locale: Locale;
  values: Values;
  set: (k: string, v: string) => void;
  errors: Record<string, string>;
}) {
  const t = (k: string) => homeText(locale, k);
  const val = (k: string) => String(values[k] || "");
  const choices: Record<string, readonly string[]> = {
    homeService: homeServices,
    homeFlexible: ["no", "yes"],
    homeFrequency: ["once", "recurring"],
    homeEquipment: ["confirm", "provider", "customer"],
    homeEntity: ["company", "team", "other"],
  };
  return (
    <section className="field full">
      <h3>{t("title")}</h3>
      <p className="notice">{t("notice")}</p>
      <div className="form-grid">
        {(kind === "request" ? homeRequestFields : homeProviderFields)
          .filter((k) => k !== "homeDate" || values.homeFlexible !== "yes")
          .map((k) => (
            <div className="field" key={k}>
              <label htmlFor={k}>{t(k)}</label>
              {k === "homeServices" ? (
                <fieldset id={k}>
                  {homeServices.map((s) => (
                    <label key={s}>
                      <input
                        type="checkbox"
                        checked={val(k).split(",").includes(s)}
                        onChange={(e) =>
                          set(
                            k,
                            (e.target.checked
                              ? [...val(k).split(",").filter(Boolean), s]
                              : val(k)
                                  .split(",")
                                  .filter((v) => v !== s)
                            ).join(","),
                          )
                        }
                      />
                      {t(s)}
                    </label>
                  ))}
                </fieldset>
              ) : choices[k] ? (
                <select id={k} value={val(k)} onChange={(e) => set(k, e.target.value)}>
                  <option value="">—</option>
                  {choices[k].map((v) => (
                    <option key={v} value={v}>
                      {t(v)}
                    </option>
                  ))}
                </select>
              ) : k === "homeDate" ? (
                <input id={k} type="date" value={val(k)} onChange={(e) => set(k, e.target.value)} />
              ) : ["homeArea", "homeRooms", "homeBathrooms"].includes(k) ? (
                <input
                  id={k}
                  type="number"
                  min="1"
                  step={k === "homeArea" ? "0.1" : "1"}
                  value={val(k)}
                  onChange={(e) => set(k, e.target.value)}
                />
              ) : (
                <textarea
                  id={k}
                  rows={2}
                  maxLength={2000}
                  value={val(k)}
                  onChange={(e) => set(k, e.target.value)}
                />
              )}{" "}
              {errors[k] && (
                <p role="alert" className="field-error">
                  {errors[k]}
                </p>
              )}
            </div>
          ))}
      </div>
    </section>
  );
}
