"use client";
import { createContext, useContext, type ReactNode } from "react";
import Link from "next/link";
import { isPublishedDestination, type PublicNavigationData } from "../lib/public-navigation";
import type { Locale } from "../lib/locales";
import { toolLocales } from "../lib/visa-search";
import { useSiteConfig } from "./SiteContext";

const PublicNavigationContext = createContext<PublicNavigationData | null>(null);
export const usePublicNavigation = () => useContext(PublicNavigationContext);
export function PublicNavigationProvider({
  value,
  children,
}: {
  value: PublicNavigationData;
  children: ReactNode;
}) {
  return (
    <PublicNavigationContext.Provider value={value}>{children}</PublicNavigationContext.Provider>
  );
}
export function PublishedLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const data = usePublicNavigation();
  if (data && !isPublishedDestination(href, data))
    return <span className={className}>{children}</span>;
  return (
    <Link href={href} className={className} rel="noopener noreferrer">
      {children}
    </Link>
  );
}
export function VisaCheckerLink({ locale }: { locale: Locale }) {
  const { activeLocales, visaChecker } = useSiteConfig();
  if (!toolLocales(activeLocales, !!visaChecker).some((code) => code === locale)) return null;
  return (
    <Link className="button" href={`/${locale}/tools/china-visa-free-checker`}>
      {locale === "zh" ? "查询来华免签政策" : "Check China visa-free policies"} ↗
    </Link>
  );
}
