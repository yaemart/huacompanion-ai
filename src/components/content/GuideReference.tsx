import { useState } from "react";
import type { ContentDraft } from "../../../payload-types";
import { safeURL, type ContentBody } from "@/lib/content-model";
import { contentSections, sectionFor } from "@/lib/content-sections";
import { ArticleEditor } from "./ArticleEditor";

export function GuideReference({
  source,
  changed,
  busy,
  onBack,
  onRefresh,
  onExisting,
}: {
  source: ContentDraft;
  changed: boolean;
  busy: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onExisting?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const body = source.body as ContentBody;
  return (
    <aside className="panel guide-reference" aria-label="原文对照">
      <h2>原文对照 · {source.locale === "zh" ? "中文" : "English"}</h2>
      <p>已保存原稿 · 修订 {source.revision}</p>
      {changed && (
        <p role="status" className="notice">
          原稿已有更新，请核对译文。
        </p>
      )}
      <button disabled={busy} onClick={onBack}>
        返回原稿
      </button>
      <button disabled={busy} onClick={onRefresh}>
        读取最新原文
      </button>
      {onExisting && (
        <button disabled={busy} onClick={onExisting}>
          打开已有译文
        </button>
      )}
      <button
        className="guide-reference-toggle"
        aria-expanded={expanded}
        aria-controls="guide-reference-body"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? "收起原文" : "展开原文"}
      </button>
      <div id="guide-reference-body" className={expanded ? "is-expanded" : ""} lang={source.locale}>
        <h3>{source.title}</h3>
        <p>
          {contentSections.find(({ id }) => id === sectionFor(body))?.zh} · 排序 {body.order ?? 0}
        </p>
        {body.summary && <p>{body.summary}</p>}
        <ArticleEditor
          disabled
          blocks={body.blocks.filter(({ type }) => type !== "image" && type !== "policy-banner")}
          onChange={() => {}}
        />
        {body.sources.length > 0 && (
          <ul aria-label="原文资料来源">
            {body.sources.map(({ id, title, url, checkedAt }) => (
              <li key={id}>
                {safeURL(url) ? (
                  <a href={url} target="_blank" rel="noreferrer">
                    {title}
                  </a>
                ) : (
                  title
                )}
                {checkedAt && <small>核实日期 {checkedAt}</small>}
              </li>
            ))}
          </ul>
        )}
        <a href={`/content-preview/${source.id}`} target="_blank" rel="noreferrer">
          预览完整原稿 ↗
        </a>
      </div>
    </aside>
  );
}
