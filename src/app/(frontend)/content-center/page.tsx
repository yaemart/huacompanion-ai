import { visaCheckerEnabled } from "@/lib/immigration-policy-flags";
import { visaSourceKeys } from "@/lib/content-source-verification";
import { contentAgentAvailable } from "@/lib/content-agent-availability";
import { canAccessContentKind } from "@/cms/access";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { contentAuth } from "@/server/content/auth";
import { ContentCenter } from "@/components/content/ContentCenter";
import { inquiryCaseID } from "@/lib/intake-case";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "内容工作台 · 华伴",
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; id?: string }>;
}) {
  const { kind, id } = await searchParams;
  if (kind === "immigration-policy" && !visaCheckerEnabled()) notFound();
  let auth: Awaited<ReturnType<typeof contentAuth>>;
  try {
    auth = await contentAuth(await headers());
  } catch {
    redirect("/admin/login");
  }
  if (kind === "immigration-policy") {
    if (!canAccessContentKind(auth.user, kind)) notFound();
    redirect("/content-center/policy-facts");
  }
  return (
    <ContentCenter
      key={kind || "all"}
      initialKind={kind}
      initialDraftID={inquiryCaseID(id)}
      contentAIAvailable={contentAgentAvailable}
      visaKeys={visaSourceKeys(process.env)}
      policyBannersEnabled={visaCheckerEnabled()}
    />
  );
}
