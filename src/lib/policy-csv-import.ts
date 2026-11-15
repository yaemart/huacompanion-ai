import { policyCountryOptions, policyIdentity } from "./immigration-policy-entry.ts";
import { policyTypes } from "./immigration-policy.ts";
import { policyTypeLabels } from "./immigration-policy-list.ts";
import { validateSharedFacts, type SharedPolicyFacts } from "./policy-shared-facts.ts";

export const policyCsvHeaders = [
  "国家代码",
  "政策类型",
  "最长停留",
  "停留单位",
  "生效日",
  "截止日",
  "适用口岸或区域",
  "官方来源链接",
  "最后核实日期",
  "中文公开说明",
  "英文公开说明",
  "内部备注",
  "内容标识",
] as const;
export const policyCsvLimit = 200;
export type PolicyCsvIssue = { line: number; message: string };
export type PolicyCsvRow = {
  line: number;
  key: string;
  facts: SharedPolicyFacts;
  notes: { locale: "zh" | "en"; title: string; publicNotes: string }[];
};

export function parsePolicyCsv(csv: string) {
  const input = csv.replace(/^\uFEFF/, "");
  const records: { line: number; cells: string[] }[] = [];
  let line = 1,
    start = 1,
    cell = "",
    cells: string[] = [];
  let state: "plain" | "quoted" | "closed" = "plain";
  function finishRow() {
    if ([...cells, cell].some((value) => value.trim()))
      records.push({ line: start, cells: [...cells, cell] });
    if (records.length > policyCsvLimit + 1) throw Error(`单次最多导入 ${policyCsvLimit} 条政策`);
    cells = [];
    cell = "";
    state = "plain";
  }
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (state === "quoted") {
      if (c === '"' && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') state = "closed";
      else {
        if (c === "\n" || (c === "\r" && input[i + 1] !== "\n")) line++;
        cell += c;
      }
    } else if (c === ",") {
      cells.push(cell);
      cell = "";
      state = "plain";
    } else if (c === "\r" || c === "\n") {
      if (c === "\r" && input[i + 1] === "\n") i++;
      finishRow();
      start = ++line;
    } else if (c === '"' && !cell && state === "plain") state = "quoted";
    else if (c === '"' || state === "closed")
      throw Error(`第 ${start} 行引号格式有误，请重新另存为 CSV`);
    else cell += c;
  }
  if (state === "quoted") throw Error(`第 ${start} 行的引号未闭合`);
  finishRow();
  return records;
}

export function validatePolicyCsv(
  csv: string,
  today: string,
  verifiedBy: number,
  allowFictional: boolean,
) {
  const [header, ...records] = parsePolicyCsv(csv);
  const headers = header?.cells.map((cell) => cell.trim()) || [];
  if (
    headers.length !== policyCsvHeaders.length ||
    new Set(headers).size !== headers.length ||
    !policyCsvHeaders.every((label) => headers.includes(label))
  )
    throw Error("表头与政策导入模板不符，请下载空白 CSV 并保留全部列名");
  if (!records.length) throw Error("请至少填写一行政策");
  const countries = new Map(
    policyCountryOptions(allowFictional).map((country) => [country.code, country]),
  );
  const issues: PolicyCsvIssue[] = [],
    rows: PolicyCsvRow[] = [];
  for (const { line, cells } of records) {
    const get = (key: (typeof policyCsvHeaders)[number]) =>
      cells[headers.indexOf(key)]?.trim() || "";
    try {
      if (cells.length !== headers.length) throw Error("列数与表头不一致，请检查逗号和引号");
      if (cells.some((cell) => cell.includes("\0"))) throw Error("单元格包含无效字符，请重新填写");
      const country = countries.get(get("国家代码").toUpperCase());
      if (!country) throw Error("请填写名单中的两位国家代码");
      const kind = get("政策类型");
      const policyType = policyTypes.find(
        (type) => kind === type || kind === policyTypeLabels[type],
      );
      if (!policyType) throw Error("政策类型无效，请填写单方面免签、互免、240小时过境或其他");
      const unit = get("停留单位");
      const maximumStay = get("最长停留");
      if (!/^\d+$/.test(maximumStay)) throw Error("最长停留必须是正整数");
      const facts = {
        countryCode: country.code,
        countryNameZh: country.nameZh,
        countryNameEn: country.nameEn,
        policyType,
        maximumStay: Number(maximumStay),
        stayUnit: unit === "小时" ? "hours" : unit === "天" ? "days" : unit,
        validFrom: get("生效日"),
        validUntil: get("截止日") || null,
        portsAndRegions: get("适用口岸或区域")
          .split(/\r\n|[\r\n]/)
          .map((v) => v.trim())
          .filter(Boolean),
        officialSourceUrl: get("官方来源链接"),
        lastVerifiedOn: get("最后核实日期"),
        verifiedBy,
        internalNotes: get("内部备注"),
      };
      validateSharedFacts(facts, today, allowFictional);
      const key = get("内容标识") || policyIdentity(facts, "zh")!.contentKey;
      if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(key)) throw Error("内容标识须为小写字母、数字或连字符");
      const notes = (["zh", "en"] as const).flatMap((locale) => {
        const publicNotes = get(locale === "zh" ? "中文公开说明" : "英文公开说明");
        if (publicNotes.length > 4000) throw Error("公开说明不能超过 4000 字");
        return publicNotes
          ? [{ locale, title: policyIdentity(facts, locale)!.title, publicNotes }]
          : [];
      });
      rows.push({ line, key, facts, notes });
    } catch (error) {
      issues.push({ line, message: error instanceof Error ? error.message : "政策字段无效" });
    }
  }
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.key, (counts.get(row.key) || 0) + 1);
  for (const row of rows)
    if (counts.get(row.key)! > 1)
      issues.push({ line: row.line, message: "文件内政策标识重复，请核对是否为同一政策" });
  return { total: records.length, rows, issues };
}
