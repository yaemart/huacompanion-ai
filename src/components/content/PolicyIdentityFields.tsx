"use client";
import React from "react";
import type { ContentBody } from "@/lib/content-model";
export function PolicyIdentityFields({
  body,
  existing,
  published,
  onChange,
}: {
  body: ContentBody;
  existing: boolean;
  published: boolean;
  onChange: <K extends "title" | "contentKey" | "slug" | "locale">(
    key: K,
    value: ContentBody[K],
  ) => void;
}) {
  return (
    <details>
      <summary>高级（标题、内容标识、网址和语言）</summary>
      {(["title", "contentKey", "slug"] as const).map((key, i) => (
        <label key={key}>
          {["标题", "内容标识（各语言共用）", "网址标识"][i]}
          <input
            value={body[key]}
            disabled={(key === "contentKey" && existing) || (key === "slug" && published)}
            onChange={(e) => onChange(key, e.target.value)}
          />
        </label>
      ))}
      <label>
        语言
        <select
          value={body.locale}
          disabled={existing}
          onChange={(e) => onChange("locale", e.target.value as ContentBody["locale"])}
        >
          {body.locale !== "en" && body.locale !== "zh" && (
            <option value={body.locale}>{body.locale}</option>
          )}
          <option value="en">English</option>
          <option value="zh">中文</option>
        </select>
      </label>
      <p>
        新建时按国家和政策类型自动填写，可手动修改。保存后内容标识和语言不可改，已发布的网址不可改。
      </p>
    </details>
  );
}
