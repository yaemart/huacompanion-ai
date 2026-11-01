import { PolicyWorkbench } from "@/components/content/PolicyWorkbench";
import { visaCheckerEnabled } from "@/lib/immigration-policy-flags";
import { canAccessContentKind } from "@/cms/access";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { contentAuth } from "@/server/content/auth";
import { ContentCenter } from "@/components/content/ContentCenter";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "内容工作台 · 华伴",
  robots: { index: false, follow: false },
};
export default async function Page({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const kind = (await searchParams).kind;
  if (kind === "immigration-policy" && !visaCheckerEnabled()) notFound();
  let auth: Awaited<ReturnType<typeof contentAuth>>;
  try {
    auth = await contentAuth(await headers());
  } catch {
    redirect("/admin/login");
  }
  if (kind === "immigration-policy") {
    if (!canAccessContentKind(auth.user, kind)) notFound();
    return <PolicyWorkbench />;
  }
  return (
    <ContentCenter
      key={kind || "all"}
      initialKind={kind}
      policyBannersEnabled={visaCheckerEnabled()}
    />
  );
}
