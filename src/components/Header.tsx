"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { nav, navPaths } from "@/lib/content";
import { switchLocale, type Locale } from "@/lib/routes";
export function Header({ locale }: { locale: Locale }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="preview-bar">
        {locale === "en"
          ? "DESIGN PREVIEW · Forms do not send or save information yet."
          : "设计预览 · 表单暂不发送或保存信息。"}
      </div>
      <header className="site-header">
        <Link className="brand" href={`/${locale}`} aria-label="Hua Companion">
          <span className="brand-mark">伴</span>
          <span>
            <b>
              华伴<span className="brand-dot">.</span>
            </b>
            <small>HUA COMPANION</small>
          </span>
        </Link>
        <button
          className="menu-toggle"
          aria-expanded={open}
          aria-controls="main-nav"
          onClick={() => setOpen(!open)}
          aria-label={locale === "en" ? "Toggle navigation" : "展开导航"}
        >
          {open ? "✕" : "☰"}
        </button>
        <nav
          id="main-nav"
          className={open ? "nav open" : "nav"}
          aria-label={locale === "en" ? "Main navigation" : "主要导航"}
        >
          {nav.map((label, i) => (
            <Link
              key={i}
              onClick={() => setOpen(false)}
              className={
                path === `/${locale}${navPaths[i] ? "/" + navPaths[i] : ""}` ||
                (navPaths[i] && path.startsWith(`/${locale}/${navPaths[i]}/`))
                  ? "active"
                  : ""
              }
              href={`/${locale}/${navPaths[i]}`}
            >
              {label[locale]}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          <Link
            className="language"
            href={switchLocale(path, locale === "en" ? "zh" : "en")}
            onClick={() => setOpen(false)}
            lang={locale === "en" ? "zh" : "en"}
          >
            {locale === "en" ? "中文" : "EN"} <span>↗</span>
          </Link>
          <Link className="button small" href={`/${locale}/request`}>
            {locale === "en" ? "Plan your visit" : "提交需求"} <span>↗</span>
          </Link>
        </div>
      </header>
    </>
  );
}
