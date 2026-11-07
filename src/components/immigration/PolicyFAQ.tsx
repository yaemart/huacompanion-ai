import React from "react";
import type { PolicyFAQItem } from "../../lib/immigration-policy-faq";

export function PolicyFAQ({ items, locale }: { items: PolicyFAQItem[]; locale: "en" | "zh" }) {
  const chinese = locale === "zh";
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
  return (
    <section className="policy-faq" aria-labelledby="policy-faq-title">
      <h2 id="policy-faq-title">{chinese ? "常见问题" : "Frequently asked questions"}</h2>
      {!items.length && (
        <p>
          {chinese
            ? "此处尚未发布已核实的常见问题。"
            : "Verified FAQs have not been published here yet."}
        </p>
      )}
      {items.map((item) => (
        <details key={item.key}>
          <summary>{item.question}</summary>
          <p className="policy-faq-answer">{item.answer}</p>
          <ul>
            {item.sources.map((source, index) => (
              <li key={index}>
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  {source.title}
                </a>
                {" · "}
                {chinese ? "最后核实日期：" : "Last verified: "}
                <time dateTime={source.checkedAt}>{source.checkedAt}</time>
              </li>
            ))}
          </ul>
        </details>
      ))}
      {items.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(schema).replace(/</g, "\\u003c"),
          }}
        />
      )}
    </section>
  );
}
