import type { PublicCompanySetting } from "../../payload-types";
type CompanyFields = Pick<
  PublicCompanySetting,
  "companyName" | "locationZh" | "locationEn" | "email" | "phone"
>;
export type PublicCompany = Partial<Record<"companyName" | "location" | "email" | "phone", string>>;
export function publicCompany(settings: CompanyFields, locale: string): PublicCompany | null {
  const values = {
    companyName: settings.companyName,
    location: locale === "zh" ? settings.locationZh : locale === "en" ? settings.locationEn : null,
    email: settings.email,
    phone: settings.phone,
  };
  const facts: PublicCompany = {};
  for (const key of Object.keys(values) as (keyof PublicCompany)[]) {
    const value = values[key]?.trim();
    if (value) facts[key] = value;
  }
  return Object.keys(facts).length ? facts : null;
}
