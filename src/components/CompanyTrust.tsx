import type { Locale } from "../lib/locales";
import { coreText } from "../lib/core-copy";
import type { PublicCompany } from "../lib/public-company";
export function CompanyTrust({
  company,
  locale,
}: {
  company: PublicCompany | null;
  locale: Locale;
}) {
  if (!company) return null;
  return (
    <aside
      className="source-note"
      style={{ overflowWrap: "anywhere" }}
      data-company-info="true"
      aria-label={coreText(locale, "Contact information", "联系信息")}
    >
      {company.companyName && <p>{company.companyName}</p>}
      {company.location && <p>{company.location}</p>}
      {company.email && (
        <p>
          <a href={`mailto:${company.email}`}>{company.email}</a>
        </p>
      )}
      {company.phone && <p>{company.phone}</p>}
    </aside>
  );
}
