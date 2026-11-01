import { PolicyBanner } from "../immigration/PolicyBanner";
import { qualityStatusLabel } from "../../lib/quality";
import type { Locale } from "../../lib/locales";
import type { Block } from "@/lib/content-model";
export function ContentBlocks({
  blocks,
  quality,
  locale,
}: {
  blocks: Block[];
  quality?: { checkedAt?: string; nextReviewAt?: string };
  locale?: Locale;
}) {
  return (
    <>
      {quality && locale && qualityStatusLabel(locale, quality) && (
        <p className="notice">{qualityStatusLabel(locale, quality)}</p>
      )}
      {blocks.map((b, i) =>
        b.type === "policy-banner" ? (
          locale ? (
            <PolicyBanner key={i} block={b} locale={locale} />
          ) : null
        ) : b.type === "heading" ? (
          <h2 key={i}>{b.text}</h2>
        ) : b.type === "list" ? (
          <ul key={i}>
            {b.text?.split("\n").map((t, j) => (
              <li key={j}>{t}</li>
            ))}
          </ul>
        ) : b.type === "image" ? (
          <figure key={i}>
            <img
              src={`/api/content-media/${b.mediaId}`}
              alt={b.text || ""}
              style={{ maxWidth: "100%", height: "auto" }}
            />
            <figcaption>{b.text}</figcaption>
          </figure>
        ) : b.type === "link" ? (
          <p key={i}>
            <a href={b.url} rel="noopener noreferrer">
              {b.text}
            </a>
          </p>
        ) : (
          <p key={i} style={{ whiteSpace: "pre-wrap" }}>
            {b.text}
          </p>
        ),
      )}
    </>
  );
}
