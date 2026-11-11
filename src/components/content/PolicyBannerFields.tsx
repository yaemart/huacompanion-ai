"use client";
import React, { useEffect, useState } from "react";
import type { Block } from "../../lib/content-model";
import { policyPageCopy } from "../../lib/immigration-policy-page-copy";
import {
  filterPolicyBannerChoices,
  type PolicyBannerChoice,
  type PolicyBannerLocale,
} from "../../lib/policy-banner-picker";

export function usePolicyBannerChoices(kind: string, locale: string, enabled: boolean) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    choices: PolicyBannerChoice[];
    error?: string;
  }>();
  const path = enabled
    ? `/api/content-center/policy-banner?${new URLSearchParams({ kind, locale })}`
    : "";
  const key = path && `${path}:${attempt}`;
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(path, { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw Error(data.error);
        if (!controller.signal.aborted) setResult({ key, choices: data.choices });
      } catch (e) {
        if (!controller.signal.aborted)
          setResult({ key, choices: [], error: (e as Error).message });
      }
    }
    void load();
    return () => controller.abort();
  }, [key, path]);
  const current = result?.key === key ? result : undefined;
  return {
    choices: current?.choices ?? [],
    loading: !!path && !current,
    error: current?.error,
    refresh: () => setAttempt((value) => value + 1),
  };
}

function optionLabel(option: PolicyBannerChoice, locale: PolicyBannerLocale) {
  const name = locale === "zh" ? option.countryNameZh : option.countryNameEn;
  const copy = policyPageCopy[locale];
  return `${name} (${option.countryCode}) · ${copy.methods[option.policyType]} · ${option.validFrom} – ${option.validUntil || copy.noExpiry}`;
}

export function PolicyBannerFields({
  value,
  onChange,
  locale,
  lookup,
}: {
  value: Block;
  onChange: (patch: Partial<Block>) => void;
  locale: PolicyBannerLocale;
  lookup?: ReturnType<typeof usePolicyBannerChoices>;
}) {
  const [query, setQuery] = useState("");
  const matches = filterPolicyBannerChoices(lookup?.choices ?? [], query);
  const selected = lookup?.choices.find(({ key }) => key === value.text);
  return (
    <fieldset className="policy-banner-fields">
      <legend>政策状态横幅</legend>
      {lookup ? (
        <>
          <label>
            搜索已发布政策
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="国家名、两位代码或政策类型"
            />
          </label>
          <label>
            选择已发布政策
            <select
              value={value.text || ""}
              onChange={(event) => onChange({ text: event.target.value })}
            >
              <option value="" disabled>
                请选择
              </option>
              {value.text && !matches.some(({ key }) => key === value.text) && (
                <option value={value.text} disabled={!selected}>
                  {selected ? optionLabel(selected, locale) : `当前不可选：${value.text}`}
                </option>
              )}
              {matches.map((option) => (
                <option key={option.key} value={option.key}>
                  {optionLabel(option, locale)}
                </option>
              ))}
            </select>
          </label>
          {selected && <p className="policy-banner-selection">{optionLabel(selected, locale)}</p>}
          <small role="status">
            {lookup.loading
              ? "正在读取已发布政策…"
              : lookup.error ||
                (matches.length
                  ? `找到 ${matches.length} 条已发布政策`
                  : "没有符合条件的已发布政策")}
          </small>
          <button type="button" disabled={lookup.loading} onClick={lookup.refresh}>
            刷新已发布政策
          </button>
        </>
      ) : (
        value.text && <p>保留原有引用：{value.text}</p>
      )}
      <label className="policy-banner-unconfirmed">
        <input
          type="checkbox"
          checked={value.policyUnconfirmed === true}
          onChange={(event) => onChange({ policyUnconfirmed: event.target.checked })}
        />
        明确标记为尚未确认
      </label>
      <small>请核对有效期。横幅随本文审核发布，工具关闭时隐藏。</small>
    </fieldset>
  );
}
