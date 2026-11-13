export type QuoteAmount = { label: string; quantity: number; unitMinor: number };
export type PartySource = "company" | "provider" | "manual";
export type QuoteLineView = QuoteAmount & {
  lineId?: string;
  mode?: "managed" | "referral";
  serviceName?: string;
  contractName?: string;
  payeeName?: string;
  partyDifferenceReason?: string;
  serviceSource?: PartySource;
  providerId?: number;
  payeeProviderId?: number;
  collection?: { reason: string; note: string };
  collectionNotice?: string;
};
export type LineCost = { lineId: string; costMinor: number };
export const collectionReasons = {
  "one-payment": "客户要求统一付款",
  "foreign-currency": "服务商不能直接收外币",
  other: "其他",
} as const;
export const collectionNotice = "本项由华伴统一收款后支付给服务方";

export function partyNameKey(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\p{Cf}/gu, "")
    .trim()
    .replace(/\s+/gu, " ")
    .toLowerCase();
}

export function quotePartiesDiffer(
  contractName: string,
  payeeName: string,
  contractProviderId?: number,
  payeeProviderId?: number,
) {
  if (contractProviderId !== undefined && payeeProviderId !== undefined)
    return contractProviderId !== payeeProviderId;
  return partyNameKey(contractName) !== partyNameKey(payeeName);
}

export function quoteLinesView(value: unknown, format: unknown, staff = false): QuoteLineView[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row: unknown) => {
    if (!row || typeof row !== "object") return [];
    const {
      label,
      quantity,
      unitMinor,
      lineId,
      mode,
      serviceName,
      contractName,
      payeeName,
      partyDifferenceReason,
      serviceSource,
      providerId,
      payeeProviderId,
      collection,
      collectionNotice,
    } = row as Partial<QuoteLineView>;
    if (typeof label !== "string" || typeof quantity !== "number" || typeof unitMinor !== "number")
      return [];
    const line: QuoteLineView = { label, quantity, unitMinor };
    if (format !== 2) return [line];
    if (typeof lineId === "string") line.lineId = lineId;
    if (mode === "managed" || mode === "referral") line.mode = mode;
    if (typeof serviceName === "string") line.serviceName = serviceName;
    if (typeof contractName === "string") line.contractName = contractName;
    if (typeof payeeName === "string") line.payeeName = payeeName;
    if (typeof collectionNotice === "string") line.collectionNotice = collectionNotice;
    if (staff) {
      if (typeof collection?.reason === "string" && typeof collection.note === "string")
        line.collection = { reason: collection.reason, note: collection.note };
      if (typeof partyDifferenceReason === "string")
        line.partyDifferenceReason = partyDifferenceReason;
      if (serviceSource === "company" || serviceSource === "provider" || serviceSource === "manual")
        line.serviceSource = serviceSource;
      if (typeof providerId === "number") line.providerId = providerId;
      if (typeof payeeProviderId === "number") line.payeeProviderId = payeeProviderId;
    }
    return [line];
  });
}
