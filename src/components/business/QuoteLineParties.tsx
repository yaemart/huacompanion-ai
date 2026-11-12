"use client";

import { useState } from "react";
import type { LineCost, QuoteAmount, QuoteLineView } from "../../lib/quote-lines";
import type { quoteLineOptions } from "../../server/business/quote-lines";

export function quotePartySummary(line: QuoteLineView, costs?: LineCost[]) {
  const parts = [
    line.mode === "managed" ? "华伴统筹" : "合作对接",
    `服务方：${line.serviceName || "待补"}${line.serviceSource === "manual" ? "（手填）" : ""}`,
    `签约方：${line.contractName || "待补"}`,
    `收款方：${line.payeeName || "待补"}`,
  ];
  if (costs) {
    const cost = costs.find(({ lineId }) => lineId === line.lineId)?.costMinor;
    parts.push(`本项成本合计：${cost == null ? "待补成本" : (cost / 100).toFixed(2)}`);
  }
  return parts.join(" · ");
}

export function quotePartyInput(form: FormData, rows: QuoteAmount[], canCost: boolean) {
  return {
    lineFormat: 2,
    lines: rows.map(({ label, quantity, unitMinor }, i) => {
      const row = { label, quantity, unitMinor };
      const party = form.get(`party-${i}`);
      if (party === "company") return { ...row, serviceSource: "company" };
      if (party === "manual")
        return { ...row, serviceSource: "manual", serviceName: form.get(`name-${i}`) };
      return { ...row, serviceSource: "provider", providerId: Number(party) };
    }),
    lineCosts: canCost
      ? rows.map((_, i) => {
          const value = form.get(`cost-${i}`);
          return value ? Math.round(Number(value) * 100) : null;
        })
      : undefined,
  };
}

export function QuoteLineParties({
  index,
  options,
  canCost,
  enabled,
}: {
  index: number;
  options: Awaited<ReturnType<typeof quoteLineOptions>>;
  canCost: boolean;
  enabled: boolean;
}) {
  const [party, setParty] = useState("company");
  const missing =
    party !== "company" &&
    party !== "manual" &&
    !options.providers.some(({ id }) => String(id) === party);
  return (
    <fieldset hidden={!enabled} disabled={!enabled}>
      <p>更换服务方会更新经营模式、签约方和收款方。</p>
      <label>
        实际服务方
        <select
          name={`party-${index}`}
          value={party}
          onChange={(event) => setParty(event.target.value)}
        >
          <option value="company">华伴自营 · {options.companyName || "主体名称未配置"}</option>
          {missing && (
            <option value={party} disabled>
              原服务商不可用，请重新选择
            </option>
          )}
          {options.providers.map(({ id, name }) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
          <option value="manual">例外：手填服务方</option>
        </select>
      </label>
      <div hidden={party !== "manual"}>
        <label>
          手填服务方名称
          <input name={`name-${index}`} required maxLength={200} disabled={party !== "manual"} />
        </label>
      </div>
      <p>{party === "company" ? "华伴统筹" : "合作对接"}，签约方与收款方按服务方带入。</p>
      {canCost && (
        <label>
          本项成本合计（可留空）
          <input name={`cost-${index}`} type="number" min={0} max={10000000} step="0.01" />
        </label>
      )}
    </fieldset>
  );
}
