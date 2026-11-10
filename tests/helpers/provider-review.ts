import { randomUUID } from "node:crypto";
import type { Payload } from "payload";
import type { Staff } from "../../src/cms/access";
import { reviewProvider } from "../../src/server/provider-review";
import type { ProviderReviewStatus } from "../../src/lib/provider-review";
export async function reviewProviderForTest(
  p: Payload,
  user: Staff,
  id: number,
  status: ProviderReviewStatus,
) {
  const doc = await p.findByID({ collection: "providers", id, depth: 0 });
  return reviewProvider(p, user, {
    id,
    status,
    reason: "虚构回归夹具：合作状态核对",
    key: randomUUID(),
    updatedAt: doc.updatedAt,
  });
}
