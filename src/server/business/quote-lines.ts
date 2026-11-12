import { randomUUID } from "node:crypto";
import type { Payload, PayloadRequest } from "payload";
import type { Staff } from "../../cms/access";
import type { LineCost, QuoteAmount } from "../../lib/quote-lines";
import { ContentError } from "../content/error";

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
const lineFields = ["label", "quantity", "unitMinor", "serviceSource", "serviceName", "providerId"];

export async function prepareQuoteLines(
  p: Payload,
  user: StaffActor,
  req: Partial<PayloadRequest>,
  value: unknown,
  amounts: QuoteAmount[],
) {
  const input = value as QuoteInput;
  if (input.lineFormat == null && input.lineCosts === undefined) return;
  if (input.lineFormat !== 2) throw new ContentError("分项成本须使用新版费用项");
  if (input.internalCostMinor != null) throw new ContentError("分项版请填写每项成本合计");
  const costs = input.lineCosts === undefined ? [] : input.lineCosts;
  if (!Array.isArray(costs) || (input.lineCosts !== undefined && costs.length !== amounts.length))
    throw new ContentError("分项成本须与费用项一一对应");
  const ids = input.lines
    .map(({ providerId }) => providerId)
    .filter((id): id is number => typeof id === "number" && Number.isSafeInteger(id) && id > 0);
  const options = await quoteLineOptions(p, user, req, ids);
  const lineCosts: LineCost[] = [];
  const lines = amounts.map((amount, i) => {
    const inputLine = input.lines[i];
    if (Object.keys(inputLine).some((field) => !lineFields.includes(field)))
      throw new ContentError("本批费用项使用默认主体与经营模式");
    const { serviceSource, serviceName, providerId } = inputLine;
    const manual = typeof serviceName === "string" ? serviceName.trim() : "";
    let name: string;
    if (serviceSource === "company" && providerId == null && serviceName == null)
      name = options.companyName;
    else if (serviceSource === "provider" && serviceName == null) {
      name = options.providers.find(({ id }) => id === providerId)?.name.trim() || "";
      if (!name) throw new ContentError("请选择权限内已核实或已签约的服务商");
    } else if (serviceSource === "manual" && providerId == null && manual && manual.length <= 200)
      name = manual;
    else throw new ContentError("请选择或填写实际服务方");
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
      mode: serviceSource === "company" ? "managed" : "referral",
      serviceName: name,
      contractName: name,
      payeeName: name,
    };
  });
  return { lines, lineCosts };
}
