import { visaCheckerEnabled } from "@/lib/immigration-policy-flags";
import { googleVerification } from "@/server/seo";
import { getPayload } from "payload";
import config from "@/payload.config";
import { isLocale, localeDirection } from "@/lib/locales";
import "./globals.css";
import { SiteProvider } from "@/components/SiteContext";
import { getSiteLocales, getPublicFeatures } from "@/server/site-config";
import { headers } from "next/headers";
import { indexingAllowed } from "@/lib/seo";
export async function generateMetadata() {
  const google = await googleVerification(await getPayload({ config }));
  return {
    verification: google ? { google } : undefined,
    title: "Hua Companion · 华伴",
    description: "Your local companion in China. Shanghai-based service coordination.",
    robots: { index: indexingAllowed(), follow: indexingAllowed() },
  };
}
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const value = (await headers()).get("x-hua-locale");
  const locale = isLocale(value) ? value : "zh";
  const activeLocales = getSiteLocales();
  const features = await getPublicFeatures();
  return (
    <html lang={locale === "zh" ? "zh-CN" : locale} dir={localeDirection(locale)}>
      <body>
        <SiteProvider value={{ activeLocales, features, visaChecker: visaCheckerEnabled() }}>
          {children}
        </SiteProvider>
      </body>
    </html>
  );
}
