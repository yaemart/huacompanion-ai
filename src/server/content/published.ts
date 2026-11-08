import { cache } from "react";
import { getPayload } from "payload";
import config from "@/payload.config";
import { listPublished } from "./service";

// Only memoize within the current server render; never cache publication state across requests.
export const publishedContent = cache(async (locale: string) =>
  listPublished(await getPayload({ config }), locale),
);
