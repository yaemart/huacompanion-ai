import { isLocale, localeDirection } from "@/lib/locales";
import "./globals.css";
import { SiteProvider } from "@/components/SiteContext";
import { getSiteLocales, getPublicFeatures } from "@/server/site-config";
import { headers } from "next/headers";
import { indexingAllowed } from "@/lib/seo";
export function generateMetadata() {
  return {
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
        <SiteProvider value={{ activeLocales, features }}>{children}</SiteProvider>
      </body>
    </html>
  );
}
