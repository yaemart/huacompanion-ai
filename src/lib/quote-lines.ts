export type QuoteAmount = { label: string; quantity: number; unitMinor: number };
export type PartySource = "company" | "provider" | "manual";
export type QuoteLineView = QuoteAmount & {
  lineId?: string;
  mode?: "managed" | "referral";
  serviceName?: string;
  contractName?: string;
  payeeName?: string;
  serviceSource?: PartySource;
  providerId?: number;
};
export type LineCost = { lineId: string; costMinor: number };

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
      serviceSource,
      providerId,
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
    if (staff) {
      if (serviceSource === "company" || serviceSource === "provider" || serviceSource === "manual")
        line.serviceSource = serviceSource;
      if (typeof providerId === "number") line.providerId = providerId;
    }
    return [line];
  });
}
