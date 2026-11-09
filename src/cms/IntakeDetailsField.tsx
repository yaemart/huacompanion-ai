import type { JSONFieldServerComponent } from "payload";
import { intakeDetailRows } from "../lib/intake-details";

export function IntakeDetailsCard({ value, title }: { value: unknown; title: string }) {
  const rows = intakeDetailRows(value);
  return (
    <section aria-label={title} style={{ marginBottom: 24 }}>
      <h3>{title}</h3>
      <p>初次提交的资料，只读保留；联系资料的后续修改不会改变这份原始记录。</p>
      {rows.length ? (
        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
            gap: 12,
          }}
        >
          {rows.map((row, index) => (
            <div
              key={index}
              style={{
                minWidth: 0,
                border: "1px solid var(--theme-elevation-150)",
                borderRadius: 6,
                padding: 12,
              }}
            >
              <dt style={{ color: "var(--theme-elevation-600)", overflowWrap: "anywhere" }}>
                {row.label}
              </dt>
              <dd style={{ margin: "8px 0 0", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p>未提供初始资料。</p>
      )}
    </section>
  );
}
export const IntakeDetailsField: JSONFieldServerComponent = ({ value, field }) => {
  return (
    <IntakeDetailsCard
      value={value}
      title={typeof field.label === "string" ? field.label : "初始资料"}
    />
  );
};
