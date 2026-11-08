"use client";
import React, { useState } from "react";
import type { PolicyForm } from "@/lib/immigration-policy-editor";
import { searchPolicyCountries, type PolicyCountry } from "@/lib/immigration-policy-entry";
export function PolicyCountryField({
  value,
  countries,
  onChange,
}: {
  value: PolicyForm;
  countries: PolicyCountry[];
  onChange: (value: PolicyForm) => void;
}) {
  const [query, setQuery] = useState("");
  const matches = searchPolicyCountries(countries, query);
  const selected = countries.find((c) => c.code === value.countryCode);
  return (
    <section aria-label="国家选择">
      <label>
        搜索国家
        <input
          type="search"
          placeholder="中文、英文或两位代码，如 德 / Ger / DE"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <label>
        国家
        <select
          value={value.countryCode || ""}
          onChange={(e) => {
            const country = countries.find((c) => c.code === e.target.value);
            onChange({
              ...value,
              countryCode: country?.code ?? null,
              countryNameEn: country?.nameEn ?? null,
              countryNameZh: country?.nameZh ?? null,
            });
            setQuery("");
          }}
        >
          <option value="">请选择国家</option>
          {value.countryCode && !selected && (
            <option value={value.countryCode} disabled>
              原代码不在名单，请重新选择（{value.countryCode}）
            </option>
          )}
          {selected && !matches.some((c) => c.code === selected.code) && (
            <option value={selected.code}>
              当前选择：{selected.nameZh} · {selected.nameEn} ({selected.code})
            </option>
          )}
          {matches.map((c) => (
            <option key={c.code} value={c.code}>
              {c.nameZh} · {c.nameEn} ({c.code})
            </option>
          ))}
        </select>
      </label>
      {query && !matches.length && <p role="status">没有匹配的国家；搜索不会修改当前选择。</p>}
      <p>
        已选：{value.countryCode || "未选择"} · {value.countryNameZh || "—"} ·{" "}
        {value.countryNameEn || "—"}
      </p>
    </section>
  );
}
