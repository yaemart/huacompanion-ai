import React from "react";
import type { PolicyQueryResult as QueryResult } from "../../lib/immigration-policy-query";
import { policyPageCopy } from "../../lib/immigration-policy-page-copy";
import { policyFormCopy } from "../../lib/immigration-policy-form-copy";
import { policyQueryCopy } from "../../lib/immigration-policy-query-copy";

export function PolicyQueryResult({
  result,
  locale,
}: {
  result: QueryResult | null;
  locale: "en" | "zh";
}) {
  const c = policyPageCopy[locale];
  return (
    <div id="policy-query-results">
      <p role="status" aria-live="polite" aria-atomic="true">
        {result?.notice[locale]}
      </p>
      <div className="policy-query-matches">
        {result?.matches.map((policy, index) => (
          <article className="policy-query-match" key={index}>
            <h3>
              {locale === "zh" ? policy.countryNameZh : policy.countryNameEn} ·{" "}
              {c.methods[policy.policyType]}
            </h3>
            <p>
              <strong>
                {c.stay}: {policy.stay.maximum} {c.units[policy.stay.unit]}
              </strong>
            </p>
            <p>
              {c.from} <time dateTime={policy.validFrom}>{policy.validFrom}</time> ·{" "}
              {policy.validUntil ? (
                <>
                  {c.until} <time dateTime={policy.validUntil}>{policy.validUntil}</time>
                </>
              ) : (
                c.noExpiry
              )}
            </p>
            {policy.publicNotes && <p>{policy.publicNotes}</p>}
            <ul>
              {policy.portsAndRegions.map((condition, i) => (
                <li key={`port-${i}`}>{condition}</li>
              ))}
              {policy.warnings.map((warning) => (
                <li key={warning}>{policyQueryCopy.warnings[warning][locale]}</li>
              ))}
            </ul>
            <a href={policy.officialSourceUrl} target="_blank" rel="noopener noreferrer">
              {c.sourceLink}
            </a>
            <p>
              {c.verified}: <time dateTime={policy.lastVerifiedOn}>{policy.lastVerifiedOn}</time>
            </p>
          </article>
        ))}
      </div>
      {result && result.status !== "invalid-input" && result.visaGuide && (
        <p>
          <a href={result.visaGuide.href}>{result.visaGuide.title}</a>
        </p>
      )}
      {result?.status === "unconfirmed" && !result.visaGuide && (
        <p>{policyFormCopy[locale].guideMissing}</p>
      )}
    </div>
  );
}
