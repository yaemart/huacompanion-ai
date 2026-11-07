import "dotenv/config";
import { getPayload } from "payload";
import config from "../src/payload.config";
import { emptyLifestyle } from "../src/lib/lifestyle";
import { mutateContent } from "../src/server/content/service";
if (process.env.APP_ENV !== "local") throw Error("Local only");
const p = await getPayload({ config });
try {
  const admin = (
    await p.find({
      collection: "staff",
      where: { and: [{ role: { equals: "admin" } }, { active: { not_equals: false } }] },
      sort: "createdAt",
      limit: 1,
    })
  ).docs[0];
  for (const kind of ["venue", "activity"] as const) {
    const key = `life-entry-template-${kind}`;
    if (
      (
        await p.find({
          collection: "content-drafts",
          where: { contentKey: { equals: key } },
          limit: 1,
        })
      ).docs.length
    )
      continue;
    await mutateContent(p, admin, {
      action: "save",
      body: {
        kind,
        contentKey: key,
        slug: key,
        locale: "zh",
        category: 6,
        title: kind === "venue" ? "餐馆与场所录入模板（待核实）" : "活动录入模板（待核实）",
        summary: "编辑示例，不代表真实推荐。请替换名称、资料及来源，经独立审核后发布。",
        blocks: [
          {
            type: "paragraph",
            text: "请介绍适合人群、主要体验和参加要求。仅填入有来源支持的信息，未知事实标为待确认。",
          },
        ],
        sources: [],
        lifestyle: {
          ...emptyLifestyle(kind),
          city: "shanghai",
          status: kind === "venue" ? "paused" : "postponed",
        },
      },
    });
  }
  console.log("Created missing unpublished life entry templates; no real venue claims published.");
} finally {
  await p.destroy();
}
process.exit(0);
