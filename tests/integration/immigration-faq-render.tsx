import React from "react";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { PolicyFAQ } from "../../src/components/immigration/PolicyFAQ";

const question = 'Fictional </script><script>alert("bad")</script>?';
const answer = "Fictional answer <img src=x onerror=bad>\nSecond line.";
for (const locale of ["en", "zh"] as const) {
  const html = renderToStaticMarkup(
    <PolicyFAQ
      locale={locale}
      items={[
        {
          key: "test-faq",
          question,
          answer,
          sources: [
            {
              title: "Fictional source",
              url: "https://example.invalid/faq",
              checkedAt: "2026-11-01",
            },
          ],
        },
      ]}
    />,
  );
  assert.match(html, /<details[ >]/);
  assert.match(html, /<summary/);
  assert.match(html, /&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<img src=x|<script>alert/);
  assert.match(html, /href="https:\/\/example.invalid\/faq"/);
  assert.match(html, /dateTime="2026-11-01"/i);
  const script = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotMatch(script, /</);
  const data = JSON.parse(script);
  assert.equal(data["@type"], "FAQPage");
  assert.deepEqual(data.mainEntity, [
    { "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } },
  ]);
  const empty = renderToStaticMarkup(<PolicyFAQ locale={locale} items={[]} />);
  assert.doesNotMatch(empty, /application\/ld|<details/);
  assert.match(empty, locale === "zh" ? /尚未/ : /not.*published/i);
}
console.log(
  "PASS bilingual SSR FAQ, exact visible/schema projection, escaped JSON-LD, source dates and honest empty state",
);
