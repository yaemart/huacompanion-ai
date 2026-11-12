import { randomUUID } from "node:crypto";
import { sql } from "@payloadcms/db-postgres";
import type { Payload, PayloadRequest } from "payload";
import type { Staff } from "../../cms/access";
import {
  partyNameKey,
  quotePartiesDiffer,
  type LineCost,
  type QuoteAmount,
} from "../../lib/quote-lines";
import { ContentError } from "../content/error";
import { executeSQL } from "../db-types";

type StaffActor = NonNullable<Staff>;

export async function quoteLineOptions(
  p: Payload,
  user: StaffActor,
  req?: Partial<PayloadRequest>,
  ids?: number[],
) {
  const company = await p.findGlobal({
    slug: "public-company-settings",
    select: { companyName: true },
    req,
  });
  const companyName = company.companyName?.trim() || "";
  if (ids?.length === 0) return { companyName, providers: [] };
  const { docs } = await p.find({
    collection: "providers",
    user,
    overrideAccess: false,
    req,
    depth: 0,
    pagination: false,
    select: { organisation: true },
    sort: "organisation",
    where: { status: { in: ["verified", "contracted"] }, ...(ids ? { id: { in: ids } } : {}) },
  });
  return {
    companyName,
    providers: docs.map(({ id, organisation }) => ({ id, name: organisation })),
  };
}

type LineInput = Record<string, unknown>;
type QuoteInput = {
  lineFormat?: unknown;
  lineCosts?: unknown;
  lines: LineInput[];
  internalCostMinor?: unknown;
};
const partyOverrides = [
  "contractName",
  "payeeName",
  "payeeProviderId",
  "partyDifferenceReason",
  "mode",
];
const partyFields = ["serviceSource", "serviceName", "providerId", ...partyOverrides];
const lineFields = ["label", "quantity", "unitMinor", ...partyFields];
const collectionClosed = "当前未开放代收，请改为合作对接，或联系管理员";

const companyNameKey = (name: string) => partyNameKey(name).replace(/[\p{P}\p{Z}]/gu, "");

async function companyNameKeys(p: Payload, req: Partial<PayloadRequest>, current: string) {
  const names = new Set(["华伴", "huacompanion", "huacompanion华伴", "华伴huacompanion"]);
  if (companyNameKey(current)) names.add(companyNameKey(current));
  const transaction = await req.transactionID;
  if (transaction) {
    const { rows } = await executeSQL(
      p,
      transaction,
      sql`
      SELECT DISTINCT line->>'serviceName' AS name
      FROM service_quotes
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(lines) = 'array' THEN lines ELSE '[]'::jsonb END
      ) AS line
      WHERE line_format = 2 AND line->>'serviceSource' = 'company'
    `,
    );
    for (const { name } of rows) {
      if (typeof name === "string" && companyNameKey(name)) names.add(companyNameKey(name));
    }
  }
  return names;
}

function partyOverride(value: unknown, defaultName: string, label: string) {
  if (value === undefined) return defaultName;
  if (typeof value !== "string" || value.trim().length > 200 || !partyNameKey(value))
    throw new ContentError(`请填写有效的${label}（最多 200 字）`);
  return partyNameKey(value) === partyNameKey(defaultName) ? defaultName : value.trim();
}

function quoteParties(
  line: LineInput,
  serviceName: string,
  providers: Awaited<ReturnType<typeof quoteLineOptions>>["providers"],
  companyNames: Set<string>,
) {
  if (line.serviceSource === "company") {
    if (partyOverrides.some((field) => Object.hasOwn(line, field)))
      throw new ContentError("华伴自营的经营模式和主体不可修改");
    return { mode: "managed", contractName: serviceName, payeeName: serviceName };
  }
  const payee = providers.find(({ id }) => id === line.payeeProviderId);
  const payeeName = payee?.name.trim() ?? serviceName;
  if (
    line.mode === "managed" ||
    companyNames.has(companyNameKey(serviceName)) ||
    companyNames.has(companyNameKey(payeeName)) ||
    (typeof line.payeeName === "string" && companyNames.has(companyNameKey(line.payeeName)))
  )
    throw new ContentError(collectionClosed);
  if (line.mode !== undefined && line.mode !== "referral")
    throw new ContentError("外部服务方须使用合作对接模式");
  if (line.payeeName !== undefined || (line.payeeProviderId !== undefined && !payee?.name.trim()))
    throw new ContentError("请选择权限内已核实或已签约的收款方");
  const contractName = partyOverride(line.contractName, serviceName, "签约方");
  const parties = {
    mode: "referral",
    contractName,
    payeeName,
    ...(payee && { payeeProviderId: payee.id }),
  };
  const contractProviderId =
    contractName === serviceName && typeof line.providerId === "number"
      ? line.providerId
      : undefined;
  const payeeProviderId =
    payee?.id ?? (typeof line.providerId === "number" ? line.providerId : undefined);
  const differs = quotePartiesDiffer(contractName, payeeName, contractProviderId, payeeProviderId);
  if (!differs) return parties;
  const reason = line.partyDifferenceReason;
  if (typeof reason !== "string" || !partyNameKey(reason) || reason.trim().length > 2000)
    throw new ContentError("请填写签约方与收款方不同的原因（最多 2000 字）");
  return { ...parties, partyDifferenceReason: reason.trim() };
}

export async function prepareQuoteLines(
  p: Payload,
  user: StaffActor,
  req: Partial<PayloadRequest>,
  value: unknown,
  amounts: QuoteAmount[],
) {
  const input = value as QuoteInput;
  if (input.lineFormat == null && input.lineCosts === undefined) {
    if (input.lines.some((line) => partyFields.some((field) => Object.hasOwn(line, field))))
      throw new ContentError("主体字段须使用新版费用项");
    return;
  }
  if (input.lineFormat !== 2) throw new ContentError("分项成本须使用新版费用项");
  if (input.internalCostMinor != null) throw new ContentError("分项版请填写每项成本合计");
  const costs = input.lineCosts === undefined ? [] : input.lineCosts;
  if (!Array.isArray(costs) || (input.lineCosts !== undefined && costs.length !== amounts.length))
    throw new ContentError("分项成本须与费用项一一对应");
  const ids = input.lines
    .flatMap(({ providerId, payeeProviderId }) => [providerId, payeeProviderId])
    .filter((id): id is number => typeof id === "number" && Number.isSafeInteger(id) && id > 0);
  const options = await quoteLineOptions(p, user, req, ids);
  const companyNames = await companyNameKeys(p, req, options.companyName);
  const lineCosts: LineCost[] = [];
  const lines = amounts.map((amount, i) => {
    const inputLine = input.lines[i];
    if (Object.keys(inputLine).some((field) => !lineFields.includes(field)))
      throw new ContentError("费用项包含不支持的字段");
    const { serviceSource, serviceName, providerId } = inputLine;
    const manual = typeof serviceName === "string" ? serviceName.trim() : "";
    let name: string;
    if (serviceSource === "company" && providerId == null && serviceName == null)
      name = options.companyName;
    else if (serviceSource === "provider" && serviceName == null) {
      name = options.providers.find(({ id }) => id === providerId)?.name.trim() || "";
      if (!name) throw new ContentError("请选择权限内已核实或已签约的服务商");
    } else if (
      serviceSource === "manual" &&
      providerId == null &&
      partyNameKey(manual) &&
      manual.length <= 200
    )
      name = manual;
    else throw new ContentError("请选择或填写实际服务方");
    const parties = quoteParties(inputLine, name, options.providers, companyNames);
    const lineId = randomUUID();
    const cost: unknown = costs[i];
    if (cost != null) {
      if (typeof cost !== "number" || !Number.isSafeInteger(cost) || cost < 0 || cost > 1000000000)
        throw new ContentError("本项成本合计须为有效金额");
      lineCosts.push({ lineId, costMinor: cost });
    }
    return {
      ...amount,
      lineId,
      serviceSource,
      ...(serviceSource === "provider" ? { providerId } : {}),
      serviceName: name,
      ...parties,
    };
  });
  return { lines, lineCosts };
}
