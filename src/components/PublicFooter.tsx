"use client";
import Link from "next/link";
import { coreText } from "../lib/core-copy";
import type { Locale } from "../lib/locales";
import { isPublishedDestination } from "../lib/public-navigation";
import { usePublicNavigation } from "./PublicNavigation";

export function PublicFooter({ locale }: { locale: Locale }) {
  const data = usePublicNavigation();
  const c = (en: string, zh: string) => coreText(locale, en, zh);
  const available = (path: string) =>
    path === "request" || !!(data && isPublishedDestination(`/${locale}/${path}`, data));
  const explore = [
    ["services", c("Our services", "来华服务")],
    ["guides", c("China guide", "来华指南")],
    ["about", c("About Hua Companion", "关于华伴")],
  ].filter(([path]) => available(path));
  const connect = [
    ["request", c("Plan your visit", "提交服务需求")],
    ["partners", c("Become a partner", "申请合作")],
    ["contact", c("Contact information", "联系信息")],
  ].filter(([path]) => available(path));
  return (
    <footer>
      <div className="footer-main">
        <div>
          <Link className="brand footer-brand" href={`/${locale}`}>
            <span className="brand-mark">伴</span>
            <span>
              <b>华伴.</b>
              <small>HUA COMPANION</small>
            </span>
          </Link>
          <p>{c("Your local companion in China.", "您来中国，华伴同行。")}</p>
        </div>
        {explore.length > 0 && (
          <div>
            <h4>{c("Explore", "了解华伴")}</h4>
            {explore.map(([path, label]) => (
              <Link key={path} href={`/${locale}/${path}`}>
                {label}
              </Link>
            ))}
          </div>
        )}
        <div>
          <h4>{c("Let’s connect", "与我们联系")}</h4>
          {connect.map(([path, label]) => (
            <Link key={path} href={`/${locale}/${path}`}>
              {label}
            </Link>
          ))}
        </div>
        <div className="footer-note">
          <h4>{c("Thoughtful coordination. Clear expectations.", "用心协调，清楚约定。")}</h4>
          <p>
            {c(
              "Service availability, providers and responsibilities are confirmed in each proposal.",
              "服务可用性、实际服务商与责任边界，均在具体方案中确认。",
            )}
          </p>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© 2026 Hua Companion · 华伴</span>
        <div>
          <Link href={`/${locale}/privacy`}>{c("Privacy notice", "隐私说明")}</Link>
          <Link href={`/${locale}/terms`}>{c("Service boundaries", "服务边界")}</Link>
        </div>
      </div>
    </footer>
  );
}
