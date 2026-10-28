"use client";
import type { Locale } from "@/lib/locales";
import { publicText, resultText } from "@/lib/public-copy";
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
  locale: Locale;
}) {
  items = items.filter((d) => d.locale === locale);
  const params = useSearchParams();
  const router = useRouter();
  const section =
    contentSections.find((s) => s.key === params.get("section"))?.id || 0;
  const setSection = (id: number) => {
    const key = contentSections.find((s) => s.id === id)?.key;
    router.replace(`/${locale}/guides${key ? `?section=${key}` : ""}`, {
      scroll: false,
    });
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
        {publicText(locale, "Search the knowledge centre")}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={publicText(
            locale,
            "For example: factory visits, transfers, long stays",
          )}
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
          {publicText(locale, "All content")}
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
              textAlign: "start",
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
              {publicText(locale, "published")}
            </small>
          </button>
        ))}
      </div>
      <p aria-live="polite">{resultText(locale, selected.length)}</p>
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
              <small>{publicText(locale, "Knowledge centre")}</small>
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
          {publicText(
            locale,
            "Content in this section is being prepared and reviewed.",
          )}
        </p>
      )}
    </>
  );
}
