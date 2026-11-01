import { isSiteLocale } from "@/server/site-config";
import { isLocale } from "@/lib/locales";
import { notFound } from "next/navigation";
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale) || !isSiteLocale(locale)) notFound();
  return children;
}
