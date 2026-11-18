import type { Payload } from "payload";
import type { ContentBody } from "../../src/lib/content-model";

export function fictionalSubscriptionPrivacy(locale: "en" | "zh"): ContentBody {
  return {
    kind: "page",
    locale,
    slug: "privacy",
    contentKey: "page-privacy",
    title: locale === "zh" ? "虚构演示隐私说明" : "Fictional privacy notice",
    summary:
      locale === "zh" ? "订阅功能的本机测试资料。" : "Local test data for email subscriptions.",
    blocks: [
      {
        type: "paragraph",
        text:
          locale === "zh"
            ? "请只填写虚构邮箱。测试会在临时数据库保存邮箱与所选主题。停止演示后，临时数据会清理。"
            : "Enter a fictional email address. Your test address and topic stay in a temporary database and are removed when the preview stops.",
      },
    ],
    sources: [],
  };
}

export function publishFictionalSubscriptionPrivacy(payload: Payload, locale: "en" | "zh") {
  return payload.create({
    collection: "content-published",
    data: {
      active: true,
      draftId: locale === "zh" ? -31 : -32,
      routeKey: `subscription-fixture-privacy:${locale}`,
      revision: 1,
      body: fictionalSubscriptionPrivacy(locale),
      publishedBy: 1,
      publishedAt: new Date().toISOString(),
    },
  });
}
