"use client";
import { useRef, useState } from "react";
import { useDocumentInfo } from "@payloadcms/ui";
import type { UIFieldClientComponent } from "payload";
import { inquiryCaseID } from "../lib/intake-case";
import {
  replyCategories,
  replyTemplateBody,
  type ReplyCategory,
  type ReplyLanguage,
  type ReplyTemplate,
} from "../lib/inquiry-reply-templates";

export const InquiryReplyTemplates: UIFieldClientComponent = () => {
  const { id, data } = useDocumentInfo();
  const inquiry = inquiryCaseID(id);
  if (!inquiry) return null;
  return (
    <ReplyEditor
      key={inquiry}
      inquiry={inquiry}
      defaultLanguage={data?.locale === "en" ? "en" : "zh"}
    />
  );
};

function ReplyEditor({
  inquiry,
  defaultLanguage,
}: {
  inquiry: number;
  defaultLanguage: ReplyLanguage;
}) {
  const [templates, setTemplates] = useState<ReplyTemplate[]>();
  const [category, setCategory] = useState<ReplyCategory>("inquiry");
  const [language, setLanguage] = useState(defaultLanguage);
  const [selected, setSelected] = useState("");
  const [body, setBody] = useState("");
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const draft = useRef<HTMLTextAreaElement>(null);
  const choices = templates?.filter((template) => template.category === category) ?? [];
  const template = choices.find((item) => String(item.id) === selected);
  async function load() {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(`/api/business/reply-templates?inquiry=${inquiry}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw Error();
      setTemplates((await response.json()).templates);
    } catch {
      setNotice("暂时无法读取模板。请重试，或确认你仍有权处理这条咨询。");
    } finally {
      setBusy(false);
    }
  }
  function insert() {
    if (!template) return;
    if (body && !replace) {
      setReplace(true);
      setNotice("回复草稿已有文字。再次点击可确认替换。");
      return;
    }
    setBody(replyTemplateBody(template, language));
    setReplace(false);
    setNotice("模板已插入，可以修改后复制。");
    draft.current?.focus();
  }
  async function copy() {
    if (!body.trim()) return;
    try {
      await navigator.clipboard.writeText(body);
      setNotice("已复制当前回复文字。");
    } catch {
      draft.current?.focus();
      draft.current?.select();
      setNotice("浏览器未允许自动复制。请使用系统的复制命令或长按选中文字复制。");
    }
  }
  return (
    <section aria-label="回复模板" style={{ marginBlock: 16 }}>
      <h3>回复模板</h3>
      <p>修改后的回复可以复制到你的沟通工具。</p>
      {!templates ? (
        <button type="button" disabled={busy} onClick={() => void load()}>
          {busy ? "正在读取…" : "读取回复模板"}
        </button>
      ) : (
        <>
          <label>
            分类{" "}
            <select
              value={category}
              onChange={(event) => {
                setCategory(event.target.value as ReplyCategory);
                setSelected("");
                setReplace(false);
                setNotice("");
              }}
            >
              {replyCategories.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>{" "}
          <label>
            回复语言{" "}
            <select
              value={language}
              onChange={(event) => {
                setLanguage(event.target.value as ReplyLanguage);
                setReplace(false);
                setNotice("");
              }}
            >
              <option value="zh">中文</option>
              <option value="en">English</option>
            </select>
          </label>{" "}
          <label>
            模板{" "}
            <select
              value={selected}
              onChange={(event) => {
                setSelected(event.target.value);
                setReplace(false);
                setNotice("");
              }}
              style={{ maxWidth: "100%" }}
            >
              <option value="">{choices.length ? "请选择模板" : "此分类暂无启用的模板"}</option>
              {choices.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>{" "}
          <button type="button" disabled={!template} onClick={insert}>
            {replace ? "确认替换草稿" : "插入模板"}
          </button>
          <p>
            <label>
              回复草稿
              <textarea
                ref={draft}
                value={body}
                rows={6}
                onChange={(event) => {
                  setBody(event.target.value);
                  setReplace(false);
                  setNotice("");
                }}
                style={{ width: "100%", boxSizing: "border-box" }}
              />
            </label>
          </p>
          <button type="button" disabled={!body.trim()} onClick={() => void copy()}>
            复制回复
          </button>
        </>
      )}
      <p role="status">{notice}</p>
    </section>
  );
}
