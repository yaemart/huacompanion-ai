import type { Payload, PayloadRequest } from "payload";

type ExportDetails = {
  filters: object;
  count: number;
  includeSensitive?: boolean;
  employees?: number;
  asOf?: string;
};

export function auditCsvExport(
  payload: Payload,
  entity: string,
  actor: number,
  headers: string[],
  after: ExportDetails,
  req?: Partial<PayloadRequest>,
) {
  return payload.create({
    collection: "audit-events",
    req,
    data: {
      entity,
      recordId: "export",
      action: "csv-export",
      actor,
      fields: headers.join(","),
      after,
    },
  });
}
