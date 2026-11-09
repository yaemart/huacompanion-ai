import { getPayload } from "payload";
import config from "@/payload.config";
import { publicInquiryReplies } from "@/lib/intake-receipt";

export async function readInquiryReplies() {
  try {
    const payload = await getPayload({ config });
    const settings = await payload.findGlobal({
      slug: "workflow-settings",
      depth: 0,
      overrideAccess: true,
    });
    return publicInquiryReplies(settings);
  } catch {
    return publicInquiryReplies(undefined);
  }
}
