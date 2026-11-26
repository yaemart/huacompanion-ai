"use client";
import { isNextEditionTarget, type ExhibitionEdition } from "@/lib/exhibition-next-edition";
import { shanghaiToday } from "@/lib/exhibitions";

export function ExhibitionNextEditionField({
  source,
  choices,
  value,
  onChange,
}: {
  source?: ExhibitionEdition;
  choices: ExhibitionEdition[];
  value: string;
  onChange: (value: string) => void;
}) {
  const today = shanghaiToday();
  const candidates = source ? choices.filter((d) => isNextEditionTarget(source, d, today)) : [];
  return (
    <label>
      下一届展会（当前语言）
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">不关联下一届</option>
        {candidates.map((d) => (
          <option key={d.contentKey} value={d.contentKey}>
            {d.title} ·{" "}
            {d.exhibition?.status === "announced" ? d.exhibition.startDate : "日期待确认"} ·{" "}
            {d.contentKey}
          </option>
        ))}
        {value && !candidates.some((d) => d.contentKey === value) && (
          <option value={value}>原关联目标当前不可用：{value}（请复核或清空）</option>
        )}
      </select>
      <small>
        仅列出当前语言已公开的有效展会；下一届关系和未定日期仍须人工核验。目标失效时不会自动改选。
      </small>
    </label>
  );
}
