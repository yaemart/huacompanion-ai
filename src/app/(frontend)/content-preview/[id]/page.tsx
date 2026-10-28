import { catalogCities } from "@/lib/catalog-options";
import { effectiveExhibitionStatus } from "@/lib/exhibitions";
import { CatalogDetails } from "@/components/catalog/CatalogPage";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { contentAuth } from "@/server/content/auth";
import { ContentBlocks } from "@/components/content/ContentBlocks";
import type { ContentBody } from "@/lib/content-model";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "工作稿预览 · 华伴",
  robots: { index: false, follow: false },
};
export default async function Preview({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let auth;
  try {
    auth = await contentAuth(await headers());
  } catch {
    redirect("/admin/login");
  }
  const { id } = await params;
  const d = await auth.p.findByID({
    collection: "content-drafts",
    id: Number(id),
    overrideAccess: false,
    user: auth.user,
  });
  const body = d.body as unknown as ContentBody;
  return (
    <main
      className="section article"
      lang={body.locale}
      dir={body.locale === "ar" ? "rtl" : "ltr"}
    >
      <p>
        工作稿预览 · {body.locale} · 修订 {d.revision} · 尚不代表网站已发布
      </p>
      <a href="/content-center">返回内容工作台</a>
      <h1>{body.title}</h1>
      <p>{body.summary}</p>
      {body.catalog && <CatalogDetails detail={body} locale={body.locale} />}
      {body.kind === "exhibition" && body.exhibition && (
        <section>
          <h2>展会资料</h2>
          <dl>
            {Object.entries({
              "届次／年份": body.exhibition.edition,
              展会状态: {
                pending: "待公布",
                announced: "已公布",
                postponed: "延期",
                cancelled: "取消",
                ended: "已结束",
              }[effectiveExhibitionStatus(body.exhibition)],
              展期: body.exhibition.startDate
                ? `${body.exhibition.startDate} — ${body.exhibition.endDate}`
                : "日期待确认",
              城市: catalogCities.find((c) => c.code === body.exhibition?.city)
                ?.zh,
              场馆: body.exhibition.venue,
              详细地址: body.exhibition.address,
              英文地址: body.exhibition.addressEn,
              行业: body.exhibition.industries.join("、"),
              适合观众: body.exhibition.audience,
              展品范围: body.exhibition.exhibits,
              "门票／报名条件": body.exhibition.admission,
              官方网站: body.exhibition.officialURL,
              报名网址: body.exhibition.registrationURL,
              最后人工核实: body.exhibition.verifiedAt,
              待确认事项: body.exhibition.unresolved,
              关联项目标识: body.exhibition.projectKeys.join("、"),
            }).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd style={{ whiteSpace: "pre-wrap" }}>{value || "未填写"}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <ContentBlocks blocks={body.blocks} />
      <h2>来源</h2>
      {body.sources.map((s) => (
        <p key={s.id}>
          <a href={s.url}>{s.title}</a>
        </p>
      ))}
    </main>
  );
}
