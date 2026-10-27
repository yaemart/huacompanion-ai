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
    <main className="section article">
      <p>
        工作稿预览 · {body.locale} · 修订 {d.revision} · 尚不代表网站已发布
      </p>
      <a href="/content-center">返回内容工作台</a>
      <h1>{body.title}</h1>
      <p>{body.summary}</p>
      {body.catalog && <CatalogDetails detail={body} locale={body.locale} />}
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
