"use client";
import { createContext, useContext } from "react";
import type { Locale } from "@/lib/locales";
import type { PublicFeatures } from "@/lib/site-locales";

type SiteConfig = {
  activeLocales: Locale[];
  features: PublicFeatures;
  visaChecker?: boolean;
  inquiryReplies?: { zh: string; en: string };
};
const SiteContext = createContext<SiteConfig>({
  activeLocales: ["zh", "en"],
  features: { customerCenter: false, textChat: false },
});
export const useSiteConfig = () => useContext(SiteContext);
export function SiteProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: SiteConfig;
}) {
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}
