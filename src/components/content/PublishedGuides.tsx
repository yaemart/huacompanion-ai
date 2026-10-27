"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { contentSections, sectionFor } from "@/lib/content-sections";
import type { ContentBody } from "@/lib/content-model";
export function PublishedGuides({
  items,
  locale,
}: {
  items: ContentBody[];
  locale: "zh" | "en";
}) {
  const params = useSearchParams();
  const router = useRouter();
  const section = contentSections.find((s) => s.key === params.get("section"))?.id || 0;
  const setSection = (id: number) => {
    const key = contentSections.find((s) => s.id === id)?.key;
    router.replace(`/${locale}/guides${key ? `?section=${key}` : ""}`, { scroll: false });
  };
  const [query, setQuery] = useState("");
  const selected = items.filter(
    (d) =>
      (!section || sectionFor(d) === section) &&
      `${d.title} ${d.summary || ""} ${d.blocks.map((b) => b.text || "").join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <label style={{ display: "block", marginBottom: 24 }}>
        {locale === "zh" ? "搜索知识中心" : "Search the knowledge centre"}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            locale === "zh"
              ? "例如：工厂访问、接机、长租"
              : "For example: factory visits, transfers, long stays"
          }
          style={{
            display: "block",
            width: "100%",
            padding: 14,
            marginTop: 8,
            border: "1px solid #9aafa5",
            borderRadius: 8,
          }}
        />
      </label>
      <div className="filters">
        <button
          aria-pressed={section === 0}
          className={!section ? "selected" : ""}
          onClick={() => setSection(0)}
        >
          {locale === "zh" ? "全部内容" : "All content"}
        </button>
      </div>
      <div className="guide-grid" style={{ marginBottom: 32 }}>
        {contentSections.map((s) => (
          <button
            key={s.id}
            aria-pressed={section === s.id}
            onClick={() => {
              const next = section === s.id ? 0 : s.id;
              setSection(next);

            }}
            style={{
              textAlign: "left",
              padding: 20,
              border:
                section === s.id ? "2px solid #245c49" : "1px solid #cad8cd",
              borderRadius: 12,
              background: section === s.id ? "#e5eee5" : "#fff",
              cursor: "pointer",
            }}
          >
            <strong>{s[locale]}</strong>
            <p>{s.description[locale]}</p>
            <small>
              {items.filter((d) => sectionFor(d) === s.id).length}{" "}
              {locale === "zh" ? "篇已发布" : "published"}
            </small>
          </button>
        ))}
      </div>
      <p aria-live="polite">
        {locale === "zh"
          ? `找到 ${selected.length} 篇内容`
          : `${selected.length} results`}
      </p>
      <div className="guide-grid">
        {selected.map((d) => (
          <Link
            className="guide-card"
            href={`/${locale}/guides/${d.slug}`}
            key={d.contentKey}
          >
            <div className={`guide-art art-${Math.min(sectionFor(d), 6)}`}>
              <span>
                {
                  ["", "行", "商", "医", "途", "居", "城", "译", "伴"][
                    sectionFor(d)
                  ]
                }
              </span>
              <small>HUA COMPANION JOURNAL</small>
            </div>
            <div className="guide-copy">
              <span className="eyebrow">
                {contentSections.find((s) => s.id === sectionFor(d))?.[locale]}
              </span>
              <h3>{d.title}</h3>
              <p>{d.summary}</p>
            </div>
          </Link>
        ))}
      </div>
      {!selected.length && (
        <p>
          {locale === "zh"
            ? "此板块的内容正在整理与审核中。"
            : "Content in this section is being prepared and reviewed."}
        </p>
      )}
    </>
  );
}
