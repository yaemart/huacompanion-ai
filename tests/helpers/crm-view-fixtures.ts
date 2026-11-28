import type { OverviewDetail } from "../../src/lib/crm-overview";
import type { TransferPreview } from "../../src/lib/crm-assignments";
export const overview: OverviewDetail = {
  client: {
    id: 1,
    reference: "CLI-FICTION",
    kind: "company",
    displayName: "<script>Fictional</script>",
    language: "en",
    countryCode: null,
    teamID: 1,
    ownerID: 2,
    status: "active",
    revision: 7,
    createdAt: "2026-11-28T00:00:00.000Z",
    ownerState: "inactive",
    ownerDisplay: { id: 2, name: "Old employee", state: "inactive" },
    visibleInquiryCount: 0,
    visibleCaseCount: 0,
    nextFollowUp: null,
    lastVisibleUpdate: "2026-11-28T00:00:00.000Z",
  },
  primaryContact: null,
  inquiries: {
    items: [],
    total: 0,
    page: 1,
    limit: 20,
    asOf: "2026-11-28T00:00:00.000Z",
    timeZone: "Asia/Shanghai",
  },
  recentUpdates: [],
};
export const transferPreview: TransferPreview = {
  clientID: 1,
  expectedClientRevision: 7,
  clientOwner: overview.client.ownerDisplay,
  receivers: [{ id: 3, name: "Next employee" }],
  inquiries: [
    {
      inquiryID: 5,
      expectedUpdatedAt: "2026-11-28T00:00:00.000Z",
      expectedOwnerID: 2,
      expectedCaseRevision: 4,
      reference: "Q-FICTION",
      name: "Fictional inquiry",
      ownerDisplay: { id: 2, name: "Old employee", state: "valid" },
      serviceCase: { id: 8, title: "Fictional case", stage: "discovery" },
    },
  ],
  total: 1,
  page: 1,
  limit: 20,
};
