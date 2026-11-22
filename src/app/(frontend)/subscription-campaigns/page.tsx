import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ContentError } from "@/server/content/error";
import { campaignStaffAuth, readCampaignWorkspace } from "@/server/subscription-campaign-workspace";
import { readCampaignDraft } from "@/server/subscription-campaign-drafts";
import { readCampaignFreeze } from "@/server/subscription-campaign-freeze";
import { campaignMockChecks } from "@/server/subscription-campaign-mock-checks";
import { readCampaignPause } from "@/server/subscription-campaign-control";
import { readCampaignTaskStatus } from "@/server/subscription-campaign-status";
import { readCampaignMockSlots } from "@/server/subscription-campaign-task-options";
import { readMockCampaignBudget } from "@/server/subscription-campaign-quota";
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
    const frozen = draft
      ? await readCampaignFreeze(p, user, {
          campaignKey: draft.campaignKey,
          revision: draft.revision,
        })
      : undefined;
    const pause =
      draft && checks?.enabled
        ? await readCampaignPause(p, user, {
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
        frozen={frozen}
        pause={pause}
        preparationBudget={
          workspace.grants && process.env.APP_ENV === "local"
            ? await readMockCampaignBudget(p, user, {})
            : undefined
        }
        taskSlots={
          draft && process.env.APP_ENV === "local"
            ? await readCampaignMockSlots(p, user, {
                campaignKey: draft.campaignKey,
                revision: draft.revision,
              })
            : undefined
        }
        taskStatus={
          draft && process.env.APP_ENV === "local"
            ? await readCampaignTaskStatus(p, user, {
                campaignKey: draft.campaignKey,
                revision: draft.revision,
              })
            : undefined
        }
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
