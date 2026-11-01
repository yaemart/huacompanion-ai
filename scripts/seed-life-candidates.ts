import "dotenv/config";
import { getPayload } from "payload";
import config from "../src/payload.config";
import { emptyLifestyle, type LifeKind } from "../src/lib/lifestyle";
import { mutateContent } from "../src/server/content/service";
import { starterLife } from "./content/starter-life";
if (process.env.APP_ENV !== "local") throw Error("Local only");
const p = await getPayload({ config });
let count = 0;
try {
  const admin = (
    await p.find({
      collection: "staff",
      where: { and: [{ role: { equals: "admin" } }, { active: { not_equals: false } }] },
      sort: "createdAt",
      limit: 1,
    })
  ).docs[0];
  for (const [id, name, category, kind, url, zh, en] of starterLife) {
    for (const locale of ["zh", "en"] as const) {
      const key = "shanghai-life-" + id;
      if (
        (
          await p.find({
            collection: "content-drafts",
            where: { and: [{ contentKey: { equals: key } }, { locale: { equals: locale } }] },
            limit: 1,
          })
        ).docs.length
      )
        continue;
      const note =
        locale === "zh"
          ? "来源已找到，尚未完成发布审核。请核实地址、营业或活动时间、收费、服务语言、年龄要求及图片授权。未与场所确认合作关系。"
          : "Source identified; not approved for publication. Verify address, hours or session dates, fees, service languages, age requirements and image rights. No partnership has been confirmed.";
      await mutateContent(p, admin, {
        action: "save",
        body: {
          kind,
          locale,
          contentKey: key,
          slug: key,
          title: name,
          summary: locale === "zh" ? zh : en,
          category: 6,
          blocks: [
            { type: "paragraph", text: locale === "zh" ? zh : en },
            { type: "paragraph", text: note },
          ],
          sources: [
            {
              id: "official",
              title:
                locale === "zh"
                  ? "官方／主办方信息来源（待人工复核）"
                  : "Official/operator source — pending human review",
              url,
            },
          ],
          lifestyle: {
            ...emptyLifestyle(kind as LifeKind),
            city: "shanghai",
            category,
            officialURL: url,
            unresolved: note,
            languageNotes:
              locale === "zh"
                ? "待确认；英文网站不代表现场提供英文服务。"
                : "To be confirmed; an English website does not establish English-speaking service.",
            sponsorship:
              locale === "zh"
                ? "待确认；收录候选不代表合作或推荐。"
                : "Unconfirmed; candidate listing does not imply partnership or endorsement.",
          },
        },
      });
      count++;
    }
  }
  console.log(JSON.stringify({ candidates: starterLife.length, newDrafts: count, published: 0 }));
} finally {
  await p.destroy();
}
process.exit(0);
