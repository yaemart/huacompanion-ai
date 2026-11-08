"use client";
import type { PolicyCountry } from "@/lib/immigration-policy-entry";
import { PolicyCountryField } from "./PolicyCountryField";
import { policyTypes } from "@/lib/immigration-policy";
import { policyLabels, type PolicyForm } from "@/lib/immigration-policy-editor";
const fields = Object.entries(policyLabels).filter(([name]) => !name.startsWith("country"));
const typeLabels = ["单方面免签", "互免", "240小时过境", "其他"];
export function PolicyFields({
  value,
  onChange,
  verifiers,
  countries,
}: {
  value: PolicyForm;
  onChange: (value: PolicyForm) => void;
  verifiers: { id: number; name: string }[];
  countries: PolicyCountry[];
}) {
  function set<K extends keyof PolicyForm>(key: K, next: PolicyForm[K]) {
    onChange({ ...value, [key]: next });
  }
  return (
    <section aria-label="政策资料">
      <h2>政策资料</h2>
      <p>仅填写人工核实的信息；日期采用中国日历日。截止日留空不代表永久有效。</p>
      <PolicyCountryField value={value} countries={countries} onChange={onChange} />
      {fields.map(([name, label]) => {
        const key = name as keyof typeof policyLabels;
        return (
          <label key={key}>
            {label}
            {key === "policyType" ? (
              <select
                value={value.policyType ?? ""}
                onChange={(e) =>
                  set("policyType", (e.target.value as PolicyForm["policyType"]) || null)
                }
              >
                <option value="">待填写</option>
                {policyTypes.map((type, i) => (
                  <option key={type} value={type}>
                    {typeLabels[i]}
                  </option>
                ))}
              </select>
            ) : key === "verifiedBy" ? (
              <select
                value={value.verifiedBy ?? ""}
                onChange={(e) => set("verifiedBy", Number(e.target.value) || null)}
              >
                <option value="">请选择核实人</option>
                {value.verifiedBy && !verifiers.some((v) => v.id === value.verifiedBy) && (
                  <option value={value.verifiedBy}>原核实人不可用，请重新选择</option>
                )}
                {verifiers.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            ) : key === "portsAndRegions" ? (
              <textarea
                value={value.portsAndRegions.join("\n")}
                onChange={(e) => set(key, e.target.value.split("\n"))}
              />
            ) : key === "publicNotes" || key === "internalNotes" ? (
              <textarea
                maxLength={4000}
                value={value[key] ?? ""}
                onChange={(e) => set(key, e.target.value)}
              />
            ) : (
              <input
                type={
                  key === "maxStayDays"
                    ? "number"
                    : key === "officialSourceUrl"
                      ? "url"
                      : ["validFrom", "validUntil", "lastVerifiedOn"].includes(key)
                        ? "date"
                        : "text"
                }
                min={key === "maxStayDays" ? 1 : undefined}
                value={value[key] ?? ""}
                onChange={(e) =>
                  set(
                    key,
                    key === "maxStayDays"
                      ? e.target.value === ""
                        ? null
                        : Number(e.target.value)
                      : e.target.value || null,
                  )
                }
              />
            )}
          </label>
        );
      })}
    </section>
  );
}
