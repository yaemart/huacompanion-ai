"use client";
import { useId } from "react";
import {
  providerOptionList,
  providerOptions,
  providerOptionValue,
  type ProviderOptionKind,
} from "../lib/provider-options";
export function ProviderOptionsPanel({
  kind,
  path,
  value,
  disabled,
  error,
  onChange,
}: {
  kind: ProviderOptionKind;
  path: string;
  value: string;
  disabled: boolean;
  error?: string;
  onChange: (value: string) => void;
}) {
  const instanceID = useId();
  const { selected, unresolved } = providerOptions(kind, value),
    label = kind === "languages" ? "支持语言" : "服务区域",
    helpID = `${path}-options-help-${instanceID}`;
  return (
    <fieldset
      disabled={disabled}
      aria-describedby={helpID}
      style={{ minWidth: 0, margin: "0 0 24px", padding: 16, overflowWrap: "anywhere" }}
    >
      <legend>{label}（必填，可多选）</legend>
      <p id={helpID}>选择实际能够提供服务的项目；保存后生效，不代表已核实或允许公开展示。</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 24px" }}>
        {providerOptionList(kind).map((row) => (
          <label key={row.code} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={selected.includes(row.code)}
              value={row.code}
              onChange={(e) =>
                onChange(
                  providerOptionValue(
                    kind,
                    e.target.checked
                      ? [...selected, row.code]
                      : selected.filter((code) => code !== row.code),
                    unresolved,
                  ),
                )
              }
            />
            {row.zh}
          </label>
        ))}
      </div>
      {unresolved.length > 0 && (
        <section aria-label={`${label}待人工核对`}>
          <p>以下旧值待人工核对，当前原文保留。确认不再适用后才移除；名单以外请联系管理员。</p>
          <ul>
            {unresolved.map((part) => (
              <li key={part}>
                {part}{" "}
                <button
                  type="button"
                  onClick={() =>
                    onChange(
                      providerOptionValue(
                        kind,
                        selected,
                        unresolved.filter((v) => v !== part),
                      ),
                    )
                  }
                >
                  已核对，移除旧值“{part}”
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {error && <p role="alert">{error}</p>}
      {!selected.length && !unresolved.length && <p role="alert">请至少选择一项{label}。</p>}
    </fieldset>
  );
}
