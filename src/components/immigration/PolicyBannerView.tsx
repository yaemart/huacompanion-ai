import React from "react";
import type { PolicyBannerState } from "../../lib/immigration-policy-banner";
import type { PublicPolicyData } from "../../lib/immigration-policy";
import { policyPageCopy } from "../../lib/immigration-policy-page-copy";

export function PolicyBannerView({
  model,
  locale,
  href,
}: {
  model: PolicyBannerState | null;
  locale: "en" | "zh";
  href?: string;
}) {
  if (!model) return null;
  const zh = locale === "zh";
  const titles = {
    expiring: zh ? "即将到期" : "Published end date approaching",
    extended: zh ? "已公布截止日已延长" : "Published end date extended",
    unconfirmed: zh ? "政策状态尚未确认" : "Policy status not yet confirmed",
  };
  const c = policyPageCopy[locale];
  const records = [model.policy, model.previous].filter((p): p is PublicPolicyData => p !== null);
  return (
    <aside
      className="notice policy-banner"
      data-policy-banner={model.status}
      aria-label={titles[model.status]}
    >
      <h2>{titles[model.status]}</h2>
      {model.policy && (
        <p>
          {zh ? model.policy.countryNameZh : model.policy.countryNameEn} ·{" "}
          {c.methods[model.policy.policyType]}
        </p>
      )}
      <p>
        {zh
          ? "仅供核对已公布的截止安排，不保证入境；未知或变更后的资格、行程及口岸条件仍须向主管机关核实。"
          : "This concerns published expiry records, not an entry guarantee. Confirm current eligibility, itinerary and port conditions with the authorities."}
      </p>
      {records.map((policy, index) => (
        <p key={index}>
          <strong>
            {index
              ? zh
                ? "前次审核发布"
                : "Previous approved publication"
              : zh
                ? "当前公开记录"
                : "Current published record"}
          </strong>
          {": "}
          {policy.validUntil ? (
            <time dateTime={policy.validUntil}>{policy.validUntil}</time>
          ) : (
            c.noExpiry
          )}
          {" · "}
          <a href={policy.officialSourceUrl} target="_blank" rel="noopener noreferrer">
            {c.sourceLink}
          </a>
          {" · "}
          {c.verified}: <time dateTime={policy.lastVerifiedOn}>{policy.lastVerifiedOn}</time>
        </p>
      ))}
      {href && <a href={href}>{zh ? "查看已发布政策" : "Check published policies"}</a>}
    </aside>
  );
}
