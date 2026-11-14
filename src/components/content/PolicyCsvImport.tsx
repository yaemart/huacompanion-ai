"use client";
import { useState } from "react";
import { policyCsvHeaders, policyCsvLimit, type PolicyCsvIssue } from "@/lib/policy-csv-import";

type Result = {
  total: number;
  issues: PolicyCsvIssue[];
  created: { line: number; key: string; groupId: number }[];
};
const template =
  "data:text/csv;charset=utf-8," +
  encodeURIComponent("\uFEFF" + policyCsvHeaders.join(",") + "\r\n");

export function PolicyCsvImport({ disabled }: { disabled: boolean }) {
  const [file, setFile] = useState<File>();
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<Result>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(save: boolean) {
    if (!file) return;
    setBusy(true);
    setError("");
    setResult(undefined);
    try {
      if (file.size > 250000) throw Error("文件超过 250 KB，请拆分后再试。");
      const text = save
        ? csv
        : new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      const response = await fetch("/api/content-center/policy-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: text, save }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      setCsv(text);
      setResult(data);
    } catch (error) {
      setError(
        error instanceof TypeError
          ? "无法读取文件，请使用 UTF-8 CSV 并重试。"
          : error instanceof Error
            ? error.message
            : "导入未完成，请重试。",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details>
      <summary>批量导入政策 CSV</summary>
      <p>
        <a href={template} download="华伴政策导入模板.csv">
          下载空白 CSV 模板
        </a>
      </p>
      <p>每行一条政策，最多 {policyCsvLimit} 条。核实人记为当前账号，请在核实来源后填写日期。</p>
      <p>
        日期用 YYYY-MM-DD，停留单位用天或小时。类型可填单方面免签、互免、240小时过境、其他。
        多个口岸请在同一个单元格内换行。内容标识留空时自动生成。
      </p>
      <fieldset disabled={busy || disabled}>
        <label>
          政策 CSV{" "}
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              setFile(event.target.files?.[0]);
              setResult(undefined);
              setError("");
            }}
          />
        </label>
        <button type="button" disabled={!file} onClick={() => void run(false)}>
          检查 CSV
        </button>
        {result && !result.issues.length && !result.created.length && (
          <button type="button" onClick={() => void run(true)}>
            导入为草稿
          </button>
        )}
      </fieldset>
      {busy && <p role="status">正在处理…</p>}
      {error && <p role="alert">{error}</p>}
      {result && (
        <p role="status">
          {result.created.length
            ? `已导入 ${result.created.length} 条草稿。`
            : result.issues.length
              ? "请修正下列问题后重新检查，未写入任何草稿。"
              : `已检查 ${result.total} 条，可导入为草稿。`}
        </p>
      )}
      {result?.issues.map(({ line, message }) => (
        <p key={`${line}-${message}`}>
          第 {line} 行：{message}
        </p>
      ))}
      {result?.created.map(({ line, groupId, key }) => (
        <p key={groupId}>
          <a href={`/content-center/policy-facts?id=${groupId}`}>
            打开第 {line} 行草稿 · {key}
          </a>
        </p>
      ))}
    </details>
  );
}
