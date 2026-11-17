import { useId } from "react";
import type { ContentFieldExamples } from "@/lib/content-field-examples-copy";

export function ContentTextField({
  label,
  value,
  onChange,
  examples,
  locale,
  singleLine = false,
  rows,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  examples?: ContentFieldExamples;
  locale: string;
  singleLine?: boolean;
  rows?: number;
}) {
  const id = useId();
  const help = locale === "zh" || locale === "en" ? examples?.[locale] : undefined;
  const template = help?.template;
  const needsCompletion = [examples?.zh.template, examples?.en.template].some((text) =>
    text?.match(/〔[^〕]+〕/g)?.some((prompt) => value.includes(prompt)),
  );
  const exampleId = `${id}-example`;
  const noteId = `${id}-template-note`;
  const props = {
    id,
    value,
    "aria-describedby":
      [help && exampleId, needsCompletion && noteId].filter(Boolean).join(" ") || undefined,
  };
  return (
    <div className="content-text-field">
      <label htmlFor={id}>
        {label}
        {singleLine ? (
          <input {...props} onChange={(event) => onChange(event.target.value)} />
        ) : (
          <textarea {...props} rows={rows} onChange={(event) => onChange(event.target.value)} />
        )}
      </label>
      {help && (
        <small id={exampleId}>
          填写示例（虚构）：<span lang={locale}>{help.example}</span>
        </small>
      )}
      {needsCompletion && (
        <small id={noteId} role="status">
          模板还有待填文字，请按核实资料替换。
        </small>
      )}
      {template && value === "" && (
        <button
          type="button"
          aria-label={`为${label}插入模板`}
          onClick={() => {
            onChange(template);
            document.getElementById(id)?.focus();
          }}
        >
          插入模板
        </button>
      )}
    </div>
  );
}
