"use client";
import type { PolicyCountry } from "@/lib/immigration-policy-entry";
import { PolicyCountryField } from "./PolicyCountryField";
import { changePolicyType, changePolicyHours } from "@/lib/immigration-policy-stay";
import { policyTypes } from "@/lib/immigration-policy";
import { shanghaiToday } from "@/lib/exhibitions";
import { policyLabels, type PolicyForm } from "@/lib/immigration-policy-editor";
const fields = Object.entries(policyLabels).filter(([name]) => !name.startsWith("country"));
const typeLabels = ["单方面免签", "互免", "240小时过境", "其他"];
export function PolicyFields({
  value,
  onChange,
  verifiers,
  countries,
  shared = false,
}: {
  value: PolicyForm;
  onChange: (value: PolicyForm) => void;
  verifiers: { id: number; name: string }[];
  countries: PolicyCountry[];
  shared?: boolean;
}) {
  const transit = value.policyType === "transit-240h";
  const visible = fields.filter(
    ([key]) =>
      key !== (transit ? "maxStayDays" : "maxStayHours") && !(shared && key === "publicNotes"),
  );
  function set<K extends keyof PolicyForm>(key: K, next: PolicyForm[K]) {
    onChange(
      key === "maxStayHours"
        ? changePolicyHours(value, next as number | null)
        : { ...value, [key]: next },
    );
  }
  return (
    <section aria-label="政策资料">
      <h2>政策资料</h2>
      <p>仅填写人工核实的信息；日期采用中国日历日。截止日留空不代表永久有效。</p>
      <PolicyCountryField value={value} countries={countries} onChange={onChange} />
      {transit && <p>过境政策须填写口岸及前往第三国等适用条件。小时值按已核实原文填写。</p>}
      {transit && value.maxStayHours == null && value.maxStayDays != null && (
        <p>旧稿未单独记录小时，按原规则显示240小时；未编辑小时字段不会写回或换算旧天数。</p>
      )}
      {visible.map(([name, label]) => {
        const key = name as keyof typeof policyLabels;
        return (
          <label key={key}>
            {label}
            {key === "lastVerifiedOn" && "（送审必填）"}
            {key === "policyType" ? (
              <select
                value={value.policyType ?? ""}
                onChange={(e) =>
                  onChange(
                    changePolicyType(value, (e.target.value as PolicyForm["policyType"]) || null),
                  )
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
                required={transit}
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
                required={key === "lastVerifiedOn"}
                max={key === "lastVerifiedOn" ? shanghaiToday() : undefined}
                type={
                  ["maxStayDays", "maxStayHours"].includes(key)
                    ? "number"
                    : key === "officialSourceUrl"
                      ? "url"
                      : ["validFrom", "validUntil", "lastVerifiedOn"].includes(key)
                        ? "date"
                        : "text"
                }
                min={["maxStayDays", "maxStayHours"].includes(key) ? 1 : undefined}
                step={["maxStayDays", "maxStayHours"].includes(key) ? 1 : undefined}
                value={
                  value[key] ?? (key === "maxStayHours" && value.maxStayDays != null ? 240 : "")
                }
                onChange={(e) =>
                  set(
                    key,
                    ["maxStayDays", "maxStayHours"].includes(key)
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
