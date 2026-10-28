import { isLocale, localeDirection } from "@/lib/locales";
import "./globals.css";
import { headers } from "next/headers";
export const metadata = {
  title: "Hua Companion · 华伴",
  description:
    "Your local companion in China. Shanghai-based service coordination.",
  robots: { index: false, follow: false },
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const value = (await headers()).get("x-hua-locale");
  const locale = isLocale(value) ? value : "zh";
  return (
    <html lang={locale === "zh" ? "zh-CN" : locale} dir={localeDirection(locale)}>
      <body>{children}</body>
    </html>
  );
}
