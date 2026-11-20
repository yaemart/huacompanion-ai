import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ContentError } from "@/server/content/error";
import { campaignStaffAuth, readCampaignWorkspace } from "@/server/subscription-campaign-workspace";
import { readCampaignDraft } from "@/server/subscription-campaign-drafts";
import { campaignMockChecks } from "@/server/subscription-campaign-mock-checks";
import { CampaignWorkspace } from "@/components/subscriptions/CampaignWorkspace";
import "@/components/subscriptions/management.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "政策群发草稿 · 华伴", robots: { index: false, follow: false } };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { p, user } = await campaignStaffAuth(await headers()).catch(() =>
    redirect("/admin/login"),
  );
  try {
    const query = await searchParams;
    const workspace = await readCampaignWorkspace(p, user);
    const draft = query.campaign ? await readCampaignDraft(p, user, query.campaign) : undefined;
    const checks = draft
      ? await campaignMockChecks(p, user, "status", {
          campaignKey: draft.campaignKey,
          revision: draft.revision,
        })
      : undefined;
    return (
      <CampaignWorkspace
        workspace={workspace}
        draft={draft}
        saved={query.saved === "1"}
        checks={checks}
      />
    );
  } catch (error) {
    if (!(error instanceof ContentError)) throw error;
    return (
      <main className="subscription-management">
        <a href="/admin">返回管理后台</a>
        <h1>政策群发草稿</h1>
        <p role="alert">{error.message}</p>
      </main>
    );
  }
}
