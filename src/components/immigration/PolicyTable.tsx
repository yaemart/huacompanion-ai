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
        <table className="policy-table" role="table">
          <caption id="policy-table-caption">{c.caption}</caption>
          <thead role="rowgroup">
            <tr role="row">
              {[c.country, c.method, c.stay, c.window, c.conditions, c.source].map((label) => (
                <th key={label} scope="col" role="columnheader">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody role="rowgroup">
            {rows.map(({ policy, dateStatus }, index) => (
              <tr key={index} role="row">
                <th scope="row" role="rowheader">
                  <span className="policy-field-label" aria-hidden="true">
                    {c.country}
                  </span>
                  {locale === "zh" ? policy.countryNameZh : policy.countryNameEn}
                  <small>{policy.countryCode}</small>
                </th>
                <td role="cell">
                  <span className="policy-field-label" aria-hidden="true">
                    {c.method}
                  </span>
                  {c.methods[policy.policyType]}
                </td>
                <td role="cell">
                  <span className="policy-field-label" aria-hidden="true">
                    {c.stay}
                  </span>
                  {policy.stay.maximum} {c.units[policy.stay.unit]}
                </td>
                <td role="cell">
                  <span className="policy-field-label" aria-hidden="true">
                    {c.window}
                  </span>
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
                <td role="cell">
                  <span className="policy-field-label" aria-hidden="true">
                    {c.conditions}
                  </span>
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
                <td role="cell">
                  <span className="policy-field-label" aria-hidden="true">
                    {c.source}
                  </span>
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
