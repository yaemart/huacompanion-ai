import { ContentError } from "./content/error";

/** A deterministic rejection before any new attempt has been written. */
export class MockCampaignLeaseError extends ContentError {
  constructor(message: string) {
    super(message, 409);
  }
}
