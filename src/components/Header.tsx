"use client";
import { supportText } from "@/lib/support";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { nav, navPaths } from "@/lib/content";
import { switchLocale, type Locale } from "@/lib/routes";
import { locales, localeNames, isLocale } from "@/lib/locales";
import { coreText } from "@/lib/core-copy";
export function Header({
  locale,
  languagePaths,
}: {
  locale: Locale;
  languagePaths?: Partial<Record<Locale, string | null>>;
}) {
  const path = usePathname();
  const c = (en: string, zh?: string) => coreText(locale, en, zh);
  const [open, setOpen] = useState(false);
  const [languageNotice, setLanguageNotice] = useState(false);
  return (
    <>
      <div className="preview-bar">
        {process.env.NEXT_PUBLIC_FORM_MODE === "trial"
          ? {
              zh: "华伴试运行 · 服务安排以人工确认为准",
              en: "Hua Companion trial · Service arrangements require staff confirmation",
              es: "Prueba de Hua Companion · El personal debe confirmar los servicios",
              fr: "Hua Companion en essai · Services soumis à confirmation",
              de: "Hua Companion Testbetrieb · Leistungen müssen bestätigt werden",
              it: "Hua Companion in prova · Servizi soggetti a conferma",
              ar: "هوا كومبانيون قيد التجربة · ترتيبات الخدمة تتطلب تأكيد الموظفين",
            }[locale]
          : c(
              process.env.NEXT_PUBLIC_FORM_MODE === "local"
                ? "LOCAL TESTING · Submissions save locally. Use fictional details only."
                : "DESIGN PREVIEW · Forms do not send or save information yet.",
            )}
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
          aria-label={c("Toggle navigation")}
        >
          {open ? "✕" : "☰"}
        </button>
        <nav id="main-nav" className={open ? "nav open" : "nav"} aria-label={c("Main navigation")}>
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
          <Link href={`/${locale}/account`}>
            {
              {
                zh: "客户中心",
                en: "My account",
                es: "Mi cuenta",
                fr: "Mon compte",
                de: "Mein Konto",
                it: "Il mio account",
                ar: "حسابي",
              }[locale]
            }
          </Link>
          <Link href={`/${locale}/support`}>{supportText(locale, "title")}</Link>
          <select
            className="language"
            aria-label={c("Website language")}
            value={locale}
            onChange={(event) => {
              const next = event.target.value;
              if (isLocale(next)) {
                if (languagePaths?.[next] === null) {
                  setLanguageNotice(true);
                  return;
                }
                setOpen(false);
                const destination = languagePaths?.[next] || switchLocale(path, next);
                window.location.assign(destination + window.location.search + window.location.hash);
              }
            }}
          >
            {locales.map((code) => (
              <option key={code} value={code} lang={code}>
                {localeNames[code]}
              </option>
            ))}
          </select>
          <Link className="button small" href={`/${locale}/request`}>
            {c("Plan your visit")} <span>↗</span>
          </Link>
        </div>
      </header>
      {languageNotice && (
        <p className="section tight" role="status">
          {c(
            "This page is not yet published in that language. You can change language from the home page.",
          )}{" "}
          <Link href={`/${locale}`}>{c("Home")}</Link>
        </p>
      )}
    </>
  );
}
