import React, { cache } from "react";
import { getPayload } from "payload";
import config from "../../payload.config";
import { visaCheckerEnabled } from "../../lib/immigration-policy-flags";
import { parsePolicyBannerBlock } from "../../lib/immigration-policy-banner";
import { readPolicyBanner } from "../../server/immigration/banner";
import { isSiteLocale } from "../../server/site-config";
import { PolicyBannerView } from "./PolicyBannerView";
import "./policy-banner.css";

const read = cache(async (key: string, locale: string, unconfirmed: boolean, today: string) =>
  readPolicyBanner(
    await getPayload({ config }),
    { type: "policy-banner", text: key, policyUnconfirmed: unconfirmed },
    locale,
    today,
  ),
);
export async function PolicyBanner({ block, locale }: { block: unknown; locale: string }) {
  const ref = parsePolicyBannerBlock(block);
  if (
    !visaCheckerEnabled() ||
    (locale !== "en" && locale !== "zh") ||
    !isSiteLocale(locale) ||
    !ref
  )
    return null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
  return (
    <PolicyBannerView
      model={await read(ref.key, locale, ref.unconfirmed, today)}
      locale={locale}
      href={`/${locale}/tools/china-visa-free-checker`}
    />
  );
}
