import "dotenv/config";
import { getPayload } from "payload";
import config from "../src/payload.config";
import { services, guides, faqs } from "../src/lib/content";
import { mutateContent } from "../src/server/content/service";
import type { ContentBody, Block } from "../src/lib/content-model";
if (process.env.APP_ENV !== "local") throw Error("Local seed only");
const p = await getPayload({ config });
const admin = (
  await p.find({
    collection: "staff",
    where: { and: [{ role: { equals: "admin" } }, { active: { not_equals: false } }] },
    sort: "createdAt",
    limit: 1,
  })
).docs[0];
let count = 0;
async function seed(body: ContentBody) {
  const exists = await p.find({
    collection: "content-drafts",
    where: { identity: { equals: `${body.contentKey}:${body.locale}` } },
    limit: 1,
  });
  if (exists.totalDocs) return;
  await mutateContent(p, admin, { action: "save", body });
  count++;
}
try {
  for (const locale of ["zh", "en"] as const) {
    for (const [i, s] of services.entries())
      await seed({
        contentKey: `service-${s.slug}`,
        kind: "service",
        locale,
        slug: s.slug,
        title: s.title[locale],
        summary: s.intro[locale],
        order: i,
        blocks: [
          {
            type: "heading",
            text: locale === "zh" ? "服务范围" : "Service scope",
          },
          { type: "list", text: s.items.map((x) => x[locale]).join("\n") },
          {
            type: "heading",
            text: locale === "zh" ? "服务边界" : "Service boundaries",
          },
          { type: "paragraph", text: s.boundary[locale] },
          {
            type: "heading",
            text: locale === "zh" ? "提前准备" : "What to prepare",
          },
          { type: "paragraph", text: s.prepare[locale] },
        ],
        sources: [],
      });
    for (const [i, g] of guides.entries())
      await seed({
        contentKey: `guide-${g.slug}`,
        kind: "guide",
        locale,
        slug: g.slug,
        title: g.title[locale],
        summary: g.desc[locale],
        category: g.category,
        order: i,
        blocks: g.sections.map(
          (s, j) =>
            ({
              type: j % 2 === 0 ? "heading" : "paragraph",
              text: s[locale],
            }) as Block,
        ),
        sources: [],
        author: "Hua Companion",
      });
    for (const [i, [q, a]] of faqs.entries())
      await seed({
        contentKey: `faq-${i + 1}`,
        kind: "faq",
        locale,
        slug: `faq-${i + 1}`,
        title: q[locale],
        blocks: [{ type: "paragraph", text: a[locale] }],
        sources: [],
        order: i,
      });
    const pages = [
      [
        "home",
        "您来中国，华伴同行。",
        "Your local companion in China.",
        "从上海出发，为您的来华行程提供清楚、用心的协调。",
        "Thoughtful coordination for your visit to China, starting from Shanghai.",
      ],
      [
        "about",
        "关于华伴",
        "About Hua Companion",
        "华伴以上海为基地，根据需求与可确认资源协调来华服务。",
        "Based in Shanghai, Hua Companion coordinates services according to your needs and confirmed resources.",
      ],
      [
        "contact",
        "联系我们",
        "Contact",
        "请通过服务需求表告诉我们您的计划。公司主体与正式联系方式将在上线前核实。",
        "Tell us about your plans through the request form. Company and official contact details will be verified before launch.",
      ],
      [
        "partners",
        "合作伙伴",
        "Partner with us",
        "我们正在建立服务网络。申请不代表已建立合作关系，公开展示需要单独审核。",
        "We are building our service network. An application does not establish a partnership; public display requires separate approval.",
      ],
    ];
    pages.push([
      "privacy",
      "隐私说明 — 本地测试",
      "Privacy notice — local testing",
      "本地测试提交保存在本机数据库，仅授权员工可访问。请使用虚构资料，不要提交病历、证件、密码或验证码。尚未接入邮件或模型，管理员可清理测试记录，备份可能保留副本。正式运营前须补齐主体、联系方式、保留期限和查阅删除流程。",
      "Local test submissions are stored on this computer for authorized staff. Use fictional details only; do not submit medical records, identity documents, passwords or codes. Email and model services are not connected. Backups may retain test records. Before launch, confirm the operating entity, contacts, retention and access/deletion procedures.",
    ]);
    await seed({
      contentKey: "page-terms",
      kind: "page",
      locale,
      slug: "terms",
      title: locale === "zh" ? "服务边界" : "Service boundaries",
      summary:
        locale === "zh"
          ? "具体安排以审核确认的方案为准。"
          : "Arrangements are subject to the confirmed proposal.",
      blocks: services.flatMap((service) => [
        { type: "heading" as const, text: service.title[locale] },
        { type: "paragraph" as const, text: service.boundary[locale] },
      ]),
      sources: [],
    });
    for (const [slug, zh, en, zhText, enText] of pages)
      await seed({
        contentKey: `page-${slug}`,
        kind: "page",
        locale,
        slug,
        title: locale === "zh" ? zh : en,
        summary: locale === "zh" ? zhText : enText,
        blocks: [{ type: "paragraph", text: locale === "zh" ? zhText : enText }],
        sources: [],
      });
  }
  console.log(
    `Imported ${count} draft records. No content was automatically approved or published.`,
  );
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await p.destroy();
  process.exit(process.exitCode || 0);
}
