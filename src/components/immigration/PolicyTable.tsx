import React from "react";
import type { PolicyTableRow } from "../../lib/immigration-policy-table";
import { policyPageCopy } from "../../lib/immigration-policy-page-copy";
import { policyQueryCopy } from "../../lib/immigration-policy-query-copy";

export function PolicyTable({ rows, locale }: { rows: PolicyTableRow[]; locale: "en" | "zh" }) {
  const c = policyPageCopy[locale];
  if (!rows.length) return <p className="policy-empty">{c.empty}</p>;
  return (
    <React.Fragment>
      <p id="policy-table-help">{c.tableHelp}</p>
      <div
        className="policy-table-scroll"
        role="region"
        aria-labelledby="policy-table-caption"
        aria-describedby="policy-table-help"
        tabIndex={0}
      >
        <table className="policy-table">
          <caption id="policy-table-caption">{c.caption}</caption>
          <thead>
            <tr>
              {[c.country, c.method, c.stay, c.window, c.conditions, c.source].map((label) => (
                <th key={label} scope="col">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ policy, dateStatus }, index) => (
              <tr key={index}>
                <th scope="row">
                  {locale === "zh" ? policy.countryNameZh : policy.countryNameEn}
                  <small>{policy.countryCode}</small>
                </th>
                <td>{c.methods[policy.policyType]}</td>
                <td>
                  {policy.stay.maximum} {c.units[policy.stay.unit]}
                </td>
                <td>
                  {c.from} <time dateTime={policy.validFrom}>{policy.validFrom}</time>
                  <br />
                  {policy.validUntil ? (
                    <>
                      {c.until} <time dateTime={policy.validUntil}>{policy.validUntil}</time>
                    </>
                  ) : (
                    c.noExpiry
                  )}
                  <p className="policy-date-status">{c.status[dateStatus]}</p>
                </td>
                <td>
                  {policy.publicNotes && <p>{policy.publicNotes}</p>}
                  <ul>
                    {policy.portsAndRegions.map((condition, i) => (
                      <li key={`port-${i}`}>{condition}</li>
                    ))}
                    {policy.warnings.map((warning) => (
                      <li key={warning}>{policyQueryCopy.warnings[warning][locale]}</li>
                    ))}
                  </ul>
                </td>
                <td>
                  <a href={policy.officialSourceUrl} target="_blank" rel="noopener noreferrer">
                    {c.sourceLink}
                  </a>
                  <p>
                    {c.verified}:{" "}
                    <time dateTime={policy.lastVerifiedOn}>{policy.lastVerifiedOn}</time>
                  </p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </React.Fragment>
  );
}
