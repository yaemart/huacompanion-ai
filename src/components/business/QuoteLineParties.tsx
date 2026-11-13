"use client";

import { useState } from "react";
import {
  partyNameKey,
  collectionReasons,
  quotePartiesDiffer,
  type QuoteAmount,
  type QuoteLineView,
} from "../../lib/quote-lines";
import type { quoteLineOptions } from "../../server/business/quote-lines";

export function quotePartySummary(line: QuoteLineView) {
  const parts = [
    line.mode === "managed" ? "华伴统筹" : "合作对接",
    `服务方：${line.serviceName || "待补"}${line.serviceSource === "manual" ? "（手填）" : ""}`,
    `签约方：${line.contractName || "待补"}`,
    `收款方：${line.payeeName || "待补"}`,
  ];
  if (line.partyDifferenceReason) parts.push(`主体差异原因：${line.partyDifferenceReason}`);
  if (line.collection) parts.push(`代收说明：${line.collection.note}`);
  return parts.join(" · ");
}

export function quotePartyInput(form: FormData, rows: QuoteAmount[], canCost: boolean) {
  return {
    lineFormat: 2,
    lines: rows.map(({ label, quantity, unitMinor }, i) => {
      const row = { label, quantity, unitMinor };
      const party = form.get(`party-${i}`);
      if (party === "company") return { ...row, serviceSource: "company" };
      const contractName = String(form.get(`contract-${i}`) ?? "").trim();
      const payeeProviderId = form.get(`payee-${i}`);
      const reason = String(form.get(`party-reason-${i}`) ?? "").trim();
      const collectByCompany = payeeProviderId === "company";
      const parties = {
        ...row,
        ...(contractName && { contractName }),
        ...(payeeProviderId && !collectByCompany && { payeeProviderId: Number(payeeProviderId) }),
        ...(collectByCompany && {
          collectByCompany,
          collection: {
            reason: form.get(`collection-reason-${i}`),
            note: form.get(`collection-note-${i}`),
          },
        }),
        ...(reason && { partyDifferenceReason: reason }),
      };
      if (party === "manual")
        return { ...parties, serviceSource: "manual", serviceName: form.get(`name-${i}`) };
      return { ...parties, serviceSource: "provider", providerId: Number(party) };
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
  requireParty = false,
}: {
  index: number;
  options: Awaited<ReturnType<typeof quoteLineOptions>>;
  canCost: boolean;
  requireParty?: boolean;
}) {
  const [party, setParty] = useState(requireParty ? "" : "company");
  const [manualName, setManualName] = useState("");
  const [contractName, setContractName] = useState("");
  const [payeeId, setPayeeId] = useState("");
  const [reason, setReason] = useState("");
  const isCompany = party === "company";
  const serviceProvider = options.providers.find(({ id }) => String(id) === party);
  const serviceName = party === "manual" ? manualName.trim() : (serviceProvider?.name ?? "");
  const payee = options.providers.find(({ id }) => String(id) === payeeId);
  const collects = payeeId === "company";
  const contract = contractName.trim() || serviceName;
  const contractProviderId =
    partyNameKey(contract) === partyNameKey(serviceName) ? serviceProvider?.id : undefined;
  const differs = quotePartiesDiffer(
    contract,
    collects ? options.companyName : (payee?.name ?? serviceName),
    contractProviderId,
    collects ? undefined : (payee?.id ?? serviceProvider?.id),
  );
  const missing =
    !!party &&
    party !== "company" &&
    party !== "manual" &&
    !options.providers.some(({ id }) => String(id) === party);
  return (
    <fieldset>
      <p>更换服务方会更新经营模式、签约方和收款方。</p>
      <label>
        实际服务方
        <select
          name={`party-${index}`}
          required
          value={party}
          onChange={(event) => {
            setParty(event.target.value);
            setContractName("");
            setPayeeId("");
            setReason("");
          }}
        >
          {requireParty && <option value="">请选择实际服务方</option>}
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
          <input
            name={`name-${index}`}
            required
            maxLength={200}
            disabled={party !== "manual"}
            value={manualName}
            onChange={(event) => setManualName(event.target.value)}
          />
        </label>
      </div>
      {isCompany ? (
        <p>
          华伴统筹。签约方和收款方均为{options.companyName || "华伴公司主体（待配置）"}，已锁定。
        </p>
      ) : party ? (
        <fieldset>
          <legend>{collects ? "华伴统筹" : "合作对接"}</legend>
          <label>
            签约方
            <input
              name={`contract-${index}`}
              value={contractName}
              onChange={(event) => setContractName(event.target.value)}
              placeholder={serviceName || "同实际服务方"}
              maxLength={200}
            />
          </label>
          <label>
            收款方
            <select
              name={`payee-${index}`}
              value={payeeId}
              onChange={(event) => setPayeeId(event.target.value)}
            >
              <option value="">同实际服务方{serviceName && ` · ${serviceName}`}</option>
              {(options.allowCollection || collects) && (
                <option value="company">
                  {options.allowCollection ? "华伴代收" : "华伴代收已关闭，请重新选择"}
                </option>
              )}
              {payeeId && !payee && !collects && (
                <option value={payeeId}>原收款方不可用，请重新选择</option>
              )}
              {options.providers.map(({ id, name }) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <p>签约方留空时使用实际服务方。{!options.allowCollection && "当前未开放华伴代收。"}</p>
          {collects && (
            <>
              <label>
                代收原因
                <select name={`collection-reason-${index}`} defaultValue="" required>
                  <option value="">请选择</option>
                  {Object.entries(collectionReasons).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                代收说明
                <textarea name={`collection-note-${index}`} maxLength={2000} required />
              </label>
            </>
          )}
          {differs && (
            <label>
              签约方与收款方不同的原因（必填）
              <textarea
                name={`party-reason-${index}`}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={2000}
                required
              />
            </label>
          )}
        </fieldset>
      ) : null}
      {canCost && (
        <label>
          本项成本合计（可留空）
          <input name={`cost-${index}`} type="number" min={0} max={10000000} step="0.01" />
        </label>
      )}
    </fieldset>
  );
}
