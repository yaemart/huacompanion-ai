import { policyLabels } from "@/lib/immigration-policy-editor";
import { readContentPreview } from "@/server/content/preview";
import { catalogCities, catalogLanguages } from "@/lib/catalog-options";
import { effectiveExhibitionStatus } from "@/lib/exhibitions";
import { CatalogDetails } from "@/components/catalog/CatalogPage";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { contentAuth } from "@/server/content/auth";
import { ContentBlocks } from "@/components/content/ContentBlocks";
import type { ContentBody } from "@/lib/content-model";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "工作稿预览 · 华伴",
  robots: { index: false, follow: false },
};
export default async function Preview({ params }: { params: Promise<{ id: string }> }) {
  let auth;
  try {
    auth = await contentAuth(await headers());
  } catch {
    redirect("/admin/login");
  }
  const { id } = await params;
  const { draft: d, policy } = await readContentPreview(auth.p, auth.user, Number(id)).catch(() =>
    notFound(),
  );
  const body = d.body as unknown as ContentBody;
  return (
    <main className="section article" lang={body.locale} dir={body.locale === "ar" ? "rtl" : "ltr"}>
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
              城市: catalogCities.find((c) => c.code === body.exhibition?.city)?.zh,
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
      {body.lifestyle && (
        <section>
          <h2>场所／活动资料</h2>
          <dl>
            {Object.entries(body.lifestyle).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{Array.isArray(v) ? v.join("、") : String(v ?? "待确认")}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {body.kind === "institution" && body.institution && (
        <section>
          <h2>医疗与康养机构资料</h2>
          <p>以下均为拟公开内容。内部合作档案及私有核验材料不在此展示。</p>
          <dl>
            {Object.entries({
              机构类型: (
                {
                  medical: "医疗机构",
                  rehabilitation: "康复机构",
                  wellness: "康养机构",
                } as Record<string, string>
              )[body.institution.type],
              城市: catalogCities.find((c) => c.code === body.institution?.city)?.zh,
              详细地址: body.institution.address,
              英文地址: body.institution.addressEn,
              到达方式: body.institution.directions,
              适合人群: body.institution.audience,
              预约方式与条件: body.institution.appointment,
              到访准备: body.institution.preparation,
              费用说明: body.institution.fees,
              外籍访客接待状态: (
                {
                  pending: "待确认（不等于不接待）",
                  confirmed: "已确认接待",
                  paused: "暂停接待",
                } as Record<string, string>
              )[body.institution.foreignAcceptance],
              外籍访客接待条件: body.institution.acceptanceConditions,
              服务语言:
                body.institution.languages
                  .map((code) => catalogLanguages.find((l) => l.code === code)?.zh || code)
                  .join("、") || "尚未确认",
              口译支持: body.institution.interpretation,
              官方网站: body.institution.officialURL,
              最后人工核实: body.institution.verifiedAt,
              公开资质核验说明: body.institution.qualification,
              待确认事项: body.institution.unresolved,
              关联项目标识: body.institution.projectKeys.join("、"),
            }).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd style={{ whiteSpace: "pre-wrap" }}>{value || "未填写"}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {policy && (
        <section>
          <dl>
            {Object.entries(policyLabels).map(([key, label]) => {
              const value = policy[key as keyof typeof policyLabels];
              return (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>{Array.isArray(value) ? value.join("；") : String(value ?? "未填写")}</dd>
                </div>
              );
            })}
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
