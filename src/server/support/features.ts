import { voiceFeatures } from "./voice-config";
import { callReadiness } from "./callGateway";
import type { Payload } from "payload";
import { featureNames, featureState, type Feature } from "../../lib/support-features";
import { ContentError } from "../content/service";
export async function supportFeatures(p: Payload, req?: any) {
  const settings = await p.findGlobal({ slug: "support-settings", overrideAccess: true, req });
  let model = false;
  try {
    model =
      !!process.env.SUPPORT_AI_KEY &&
      new URL(process.env.SUPPORT_AI_ENDPOINT || "").protocol === "https:" &&
      Number(process.env.SUPPORT_AI_DAILY_TOKENS) > 0;
  } catch {}
  return Object.fromEntries(
    (Object.keys(featureNames) as Feature[]).map((key) => [
      key,
      featureState(key, settings as any, {
        aiReception: model,
        translation: model,
        ...voiceFeatures(),
        ...callReadiness(),
      }),
    ]),
  ) as Record<Feature, ReturnType<typeof featureState>>;
}
export async function requireSupportFeature(p: Payload, key: Feature, req?: any) {
  if (!(await supportFeatures(p, req))[key].available)
    throw new ContentError("此客服功能尚未启用或配置", 503);
}
