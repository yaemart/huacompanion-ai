import type { ContentBody } from "./content-model.ts";
import type { PolicyForm } from "./immigration-policy-editor.ts";
import { policyTypeLabels } from "./immigration-policy-list.ts";
// Public-domain ISO alpha-2 list: https://data.iana.org/time-zones/tzdb/iso3166.tab (2025-07-01).
const codes =
  `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS
BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE
EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM
HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC
LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA
NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW
SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO
TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`.split(/\s+/);
const fictional = ["XY", "XZ", "XW", "XQ"];
export type PolicyCountry = { code: string; nameEn: string; nameZh: string };
export function policyTestCountriesAllowed(env: { APP_ENV?: string; NODE_ENV?: string }) {
  return env.APP_ENV === "local" && env.NODE_ENV !== "production";
}
export function assertPolicyCountry(code: unknown, allowFictional: boolean) {
  if (code == null) return;
  if (
    typeof code !== "string" ||
    (!codes.includes(code) && !(allowFictional && fictional.includes(code)))
  )
    throw Error("国家代码不在可选名单中，请重新选择国家；虚构国家仅供本地测试");
}
/** Called on the server; fixed Node24 ICU names are serialized, never generated in the browser. */
export function policyCountryOptions(allowFictional: boolean): PolicyCountry[] {
  const en = new Intl.DisplayNames(["en"], { type: "region" });
  const zh = new Intl.DisplayNames(["zh-CN"], { type: "region" });
  return [
    ...codes.map((code) => ({ code, nameEn: en.of(code)!, nameZh: zh.of(code)! })),
    ...(allowFictional
      ? fictional.map((code) => ({
          code,
          nameEn: `Fictional country ${code} (DEMO)`,
          nameZh: `虚构测试国家${code}（演示）`,
        }))
      : []),
  ];
}
export function searchPolicyCountries(options: readonly PolicyCountry[], query: string) {
  const q = query.normalize("NFKC").trim().toLowerCase();
  return options
    .filter((o) => `${o.code} ${o.nameEn} ${o.nameZh}`.toLowerCase().includes(q))
    .sort((a, b) => Number(b.code.toLowerCase() === q) - Number(a.code.toLowerCase() === q));
}
const suffix = {
  unilateral: "unilateral-visa-free",
  bilateral: "bilateral-visa-free",
  "transit-240h": "transit-240h",
  other: "other-policy",
};
const english = {
  unilateral: "Unilateral visa-free",
  bilateral: "Mutual visa exemption",
  "transit-240h": "240-hour transit",
  other: "Other policy",
};
function identity(policy: PolicyForm, locale: ContentBody["locale"]) {
  if (!policy.countryCode || !policy.policyType) return null;
  const key = `${policy.countryCode.toLowerCase()}-${suffix[policy.policyType]}`;
  return {
    contentKey: key,
    slug: key,
    title: `${locale === "zh" ? policy.countryNameZh : policy.countryNameEn} · ${locale === "zh" ? policyTypeLabels[policy.policyType] : english[policy.policyType]}`,
  };
}
export function autoPolicyIdentity(
  body: ContentBody,
  previous: PolicyForm,
  next: PolicyForm,
  previousLocale = body.locale,
): ContentBody {
  const before = identity(previous, previousLocale),
    after = identity(next, body.locale);
  const updated = { ...body };
  for (const key of ["title", "contentKey", "slug"] as const)
    if (!body[key] || body[key] === before?.[key]) updated[key] = after?.[key] ?? "";
  return updated;
}

export { identity as policyIdentity };
