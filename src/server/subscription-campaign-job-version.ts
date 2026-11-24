import type { Payload, PayloadRequest } from "payload";
import type {
  SubscriptionCampaignBatch,
  SubscriptionCampaignDraft,
  SubscriptionCampaignJob,
} from "../../payload-types";
import { relationID } from "../cms/access";

export function campaignJobDraft(job: SubscriptionCampaignJob, batch: SubscriptionCampaignBatch) {
  if (relationID(job.batch) !== batch.id || job.campaignKey !== batch.campaignKey) return null;
  return relationID(job.continuationDraft) ?? relationID(batch.draft);
}

export async function campaignBatchMatches(
  p: Payload,
  req: Partial<PayloadRequest>,
  batch: SubscriptionCampaignBatch,
  draft: SubscriptionCampaignDraft,
) {
  if (batch.campaignKey !== draft.campaignKey) return false;
  if (relationID(batch.draft) === draft.id) return true;
  return (
    (
      await p.find({
        collection: "subscription-campaign-jobs",
        req,
        depth: 0,
        limit: 1,
        where: {
          and: [
            { batch: { equals: batch.id } },
            { campaignKey: { equals: draft.campaignKey } },
            { continuationDraft: { equals: draft.id } },
          ],
        },
      })
    ).docs.length > 0
  );
}
