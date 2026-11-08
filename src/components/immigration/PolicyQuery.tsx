"use client";
import React from "react";
import type { PublicPolicyData } from "../../lib/immigration-policy";
import { policyCountryOptions } from "../../lib/immigration-policy-browser";
import {
  queryImmigrationPolicies,
  type PolicyQueryResult as QueryResult,
} from "../../lib/immigration-policy-query";
import { policyFormCopy } from "../../lib/immigration-policy-form-copy";
import { PolicyQueryResult } from "./PolicyQueryResult";

const subscribe = () => () => {};
export function PolicyQuery({
  locale,
  policies,
  verifiedOnOrBefore,
  visaGuide,
  children,
}: {
  locale: "en" | "zh";
  policies: PublicPolicyData[];
  verifiedOnOrBefore: string;
  visaGuide: QueryResult["visaGuide"];
  children?: React.ReactNode;
}) {
  const ready = React.useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const [country, setCountry] = React.useState("");
  const [date, setDate] = React.useState("");
  const [result, setResult] = React.useState<QueryResult | null>(null);
  const [referenceOpen, setReferenceOpen] = React.useState(true);
  const countries = React.useMemo(
    () => policyCountryOptions(policies, verifiedOnOrBefore, locale),
    [policies, verifiedOnOrBefore, locale],
  );
  const c = policyFormCopy[locale];
  function runQuery() {
    const next = queryImmigrationPolicies(
      { nationalityISO: country === "__unlisted__" ? null : country, arrivalDate: date },
      policies,
      { verifiedOnOrBefore, visaGuide },
    );
    setResult(next);
    setReferenceOpen(next.status === "invalid-input");
  }
  const countryError = result?.errors.includes("nationalityISO");
  const dateError = result?.errors.includes("arrivalDate");
  return (
    <section className="policy-query" aria-labelledby="policy-query-title">
      <h2 id="policy-query-title">{c.title}</h2>
      <p id="policy-query-privacy">{c.privacy}</p>
      <p>{c.fallback}</p>
      <fieldset
        disabled={!ready}
        className="policy-query-controls"
        aria-describedby="policy-query-privacy"
      >
        <div>
          <label htmlFor="policy-nationality">{c.nationality}</label>
          <select
            id="policy-nationality"
            autoComplete="off"
            value={country}
            aria-invalid={countryError || undefined}
            aria-describedby={countryError ? "policy-country-error" : undefined}
            onChange={(event) => {
              setCountry(event.target.value);
              setResult(null);
              setReferenceOpen(true);
            }}
          >
            <option value="">{c.choose}</option>
            {countries.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
            <option value="__unlisted__">{c.unlisted}</option>
          </select>
          {countryError && <p id="policy-country-error">{c.countryError}</p>}
        </div>
        <div>
          <label htmlFor="policy-arrival">{c.arrival}</label>
          <input
            id="policy-arrival"
            type="date"
            autoComplete="off"
            value={date}
            aria-invalid={dateError || undefined}
            aria-describedby={dateError ? "policy-date-error" : undefined}
            onChange={(event) => {
              setDate(event.target.value);
              setResult(null);
              setReferenceOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                runQuery();
              }
            }}
          />
          {dateError && <p id="policy-date-error">{c.dateError}</p>}
        </div>
        <button
          className="button"
          type="button"
          aria-controls="policy-query-results"
          onClick={runQuery}
        >
          {c.submit}
        </button>
      </fieldset>
      <PolicyQueryResult result={result} locale={locale} />
      {children && (
        <details
          className="policy-full-reference"
          open={referenceOpen}
          onToggle={(event) => setReferenceOpen(event.currentTarget.open)}
        >
          <summary>{c.reference}</summary>
          {children}
        </details>
      )}
    </section>
  );
}
