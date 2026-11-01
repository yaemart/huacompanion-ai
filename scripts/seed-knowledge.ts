import "dotenv/config";
import { getPayload } from "payload";
import config from "../src/payload.config";
import { topics } from "./content/starter-topics";
import { mutateContent } from "../src/server/content/service";
import { contentSections } from "../src/lib/content-sections";
import type { ContentBody } from "../src/lib/content-model";
if (
  process.env.APP_ENV !== "local" ||
  !process.env.DATABASE_URL?.includes("@127.0.0.1:55438/hua_companion")
)
  throw Error("Dedicated local database required");
if (
  topics.length !== 32 ||
  new Set(topics.map((t) => t[1])).size !== 32 ||
  contentSections.some((s) => topics.filter((t) => t[0] === s.id).length !== 4)
)
  throw Error("Editorial plan must have four unique topics per section");
const p = await getPayload({ config });
const admin = (
  await p.find({
    collection: "staff",
    where: { and: [{ role: { equals: "admin" } }, { active: { not_equals: false } }] },
    sort: "createdAt",
    limit: 1,
  })
).docs[0];
let created = 0;
const confirm: Record<number, [string, string]> = {
  1: [
    "行前及入境要求取决于个人情况和行程日期，本文不作资格判断；须核实官方当前要求。",
    "Pre-travel and entry requirements depend on circumstances and dates. This article does not determine eligibility; verify current official requirements.",
  ],
  2: [
    "本文用于准备商务沟通，不替代验厂、产品检测、认证、合同审查或供应商信用调查。",
    "This article prepares business communication, not factory audits, testing, certification, contract review or supplier due diligence.",
  ],
  3: [
    "华伴仅协调流程与配套服务，不提供诊断、治疗建议或接诊和疗效承诺。紧急医疗需求应联系当地专业急救服务。",
    "Hua Companion coordinates practical arrangements, not diagnosis or treatment, and does " +
      "not promise acceptance or outcomes. For urgent medical needs, contact appropriate " +
      "local emergency services.",
  ],
  4: [
    "车辆、时间、费用、等待和取消条件由实际服务方确认，本文不表示已有可预订资源。",
    "The actual provider must confirm vehicles, timing, charges, waiting and cancellation terms. This article does not establish available inventory.",
  ],
  5: [
    "入住、租赁、通信和支付要求需分别向实际机构核实，本文不承诺资格、可用性或交易成功。",
    "Confirm accommodation, rental, connectivity and payment requirements with the relevant " +
      "providers. This article does not guarantee eligibility, availability or transaction " +
      "success.",
  ],
  6: [
    "开放时间、门票、预约和承接机构需按行程日期核实，本文不是确认行程或报价。",
    "Verify opening hours, tickets, reservations and organizers for your travel dates. This article is not a confirmed itinerary or quotation.",
  ],
  7: [
    "人员能力、保密、时长和计费须单独确认，翻译与陪同不替代专业决策。",
    "Confirm competence, confidentiality, duration and charges separately. Interpretation and accompaniment do not replace professional decisions.",
  ],
  8: [
    "咨询不等于预订。实际服务方、签约方、收款方、范围和费用须在具体方案中明确。",
    "An enquiry is not a booking. Confirm providers, contracting and payment parties, scope and charges in the specific proposal.",
  ],
};
try {
  for (const [category, slug, zh, en, zhSteps, enSteps] of topics) {
    for (const locale of ["zh", "en"] as const) {
      const key = "knowledge-" + slug;
      if (
        (
          await p.find({
            collection: "content-drafts",
            where: { identity: { equals: `${key}:${locale}` } },
            limit: 1,
          })
        ).totalDocs
      )
        continue;
      const steps = locale === "zh" ? zhSteps : enSteps;
      const section = contentSections.find((s) => s.id === category)!;
      const body: ContentBody = {
        contentKey: key,
        kind: "guide",
        locale,
        slug,
        title: locale === "zh" ? zh : en,
        summary: steps[0],
        category,
        order: category === 2 ? -100 + created : category * 10 + created,
        author:
          locale === "zh"
            ? "华伴编辑工作稿（待人工审核）"
            : "Hua Companion editorial draft — pending human review",
        blocks: [
          {
            type: "heading",
            text: locale === "zh" ? "适用场景" : "When this helps",
          },
          { type: "paragraph", text: section.description[locale] },
          {
            type: "heading",
            text: locale === "zh" ? "行动清单" : "Action checklist",
          },
          ...steps.map((text, i) => ({
            type: "paragraph" as const,
            text: `${i + 1}. ${text}`,
          })),
          {
            type: "heading",
            text: locale === "zh" ? "服务边界与待确认事项" : "Limits and matters to confirm",
          },
          {
            type: "paragraph",
            text: confirm[category][locale === "zh" ? 0 : 1],
          },
          { type: "heading", text: locale === "zh" ? "下一步" : "Next step" },
          {
            type: "paragraph",
            text:
              locale === "zh"
                ? "整理目的、城市、大致日期、人数、沟通语言及上述尚未确认的问题，再通过服务需求表咨询。请仅提供安排所需的信息。"
                : "Prepare your purpose, city, approximate dates, group size, language and unresolved questions before using the enquiry form. Share only information needed for the arrangements.",
          },
        ],
        sources: [],
      };
      await mutateContent(p, admin, { action: "save", body });
      created++;
    }
  }
  // Add derived labels to existing rows without changing their content or review state.
  let page = 1;
  while (true) {
    const r = await p.find({
      collection: "content-drafts",
      limit: 100,
      page,
      sort: "id",
    });
    for (const d of r.docs)
      if (!d.sectionLabel)
        await p.update({
          collection: "content-drafts",
          id: d.id,
          data: { title: d.title },
        });
    if (!r.hasNextPage) break;
    page++;
  }
  console.log(
    `Created ${created} language drafts across 32 topics. No approval or publication performed. Sources remain pending human review.`,
  );
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await p.destroy();
  process.exit(process.exitCode || 0);
}
