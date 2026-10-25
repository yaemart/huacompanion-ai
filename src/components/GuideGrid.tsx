"use client";
import { useState } from "react";
import Link from "next/link";
import { guides, guideCategories } from "@/lib/content";
import type { Locale } from "@/lib/routes";
export function GuideGrid({ locale }: { locale: Locale }) {
  const [category, setCategory] = useState(0);
  return (
    <>
      <div
        className="filters"
        aria-label={locale === "en" ? "Guide categories" : "指南分类"}
      >
        {guideCategories.map((c, i) => (
          <button
            key={i}
            aria-pressed={category === i}
            className={category === i ? "selected" : ""}
            onClick={() => setCategory(i)}
          >
            {c[locale]}
          </button>
        ))}
      </div>
      <div className="guide-grid">
        {guides
          .filter((g) => !category || g.category === category)
          .map((g) => (
            <Link
              href={`/${locale}/guides/${g.slug}`}
              className="guide-card"
              key={g.slug}
            >
              <div className={`guide-art art-${g.category}`}>
                <span>
                  {["", "行", "商", "医", "途", "居", "城"][g.category]}
                </span>
                <small>HUA COMPANION JOURNAL</small>
              </div>
              <div className="guide-copy">
                <span className="eyebrow">
                  {guideCategories[g.category][locale]} · {g.read}{" "}
                  {locale === "en" ? "MIN READ" : "分钟阅读"}
                </span>
                <h3>{g.title[locale]}</h3>
                <p>{g.desc[locale]}</p>
                <span className="text-link">
                  {locale === "en" ? "Read guide" : "阅读指南"} ↗
                </span>
              </div>
            </Link>
          ))}
      </div>
    </>
  );
}
