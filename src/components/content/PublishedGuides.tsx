"use client";
import { useState } from "react";
import Link from "next/link";
import { filterGuides } from "@/lib/content-filter";
import type { ContentBody } from "@/lib/content-model";
export function PublishedGuides({
  items,
  locale,
}: {
  items: ContentBody[];
  locale: "zh" | "en";
}) {
  const [category, setCategory] = useState(0);
  const labels =
    locale === "zh"
      ? [
          "全部指南",
          "行前准备",
          "商务参展",
          "就医流程",
          "交通",
          "住宿",
          "文化生活",
        ]
      : [
          "All guides",
          "Before arrival",
          "Business visits",
          "Medical visits",
          "Getting around",
          "Staying in China",
          "Culture & daily life",
        ];
  const selected = filterGuides(items, category);
  return (
    <>
      <div
        className="filters"
        aria-label={locale === "zh" ? "指南分类" : "Guide categories"}
      >
        {labels.map((l, i) => (
          <button
            key={i}
            aria-pressed={category === i}
            className={category === i ? "selected" : ""}
            onClick={() => setCategory(i)}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="guide-grid">
        {selected.map((d) => (
          <Link
            key={d.contentKey}
            href={`/${locale}/guides/${d.slug}`}
            className="guide-card"
          >
            <div className={`guide-art art-${d.category || 1}`}>
              <span>
                {["", "行", "商", "医", "途", "居", "城"][d.category || 1]}
              </span>
              <small>HUA COMPANION JOURNAL</small>
            </div>
            <div className="guide-copy">
              <h3>{d.title}</h3>
              <p>{d.summary}</p>
            </div>
          </Link>
        ))}
      </div>
      {!selected.length && (
        <p>
          {locale === "zh"
            ? "该分类暂无已发布指南。"
            : "No published guides in this category yet."}
        </p>
      )}
    </>
  );
}
