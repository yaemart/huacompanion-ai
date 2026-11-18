import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ContentError } from "@/server/content/error";
import {
  readSubscriptionManagement,
  subscriptionAdminAuth,
} from "@/server/subscription-management";
import { SubscriptionManagement } from "@/components/subscriptions/SubscriptionManagement";
import "@/components/subscriptions/management.css";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "订阅管理 · 华伴",
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { p, user } = await subscriptionAdminAuth(await headers()).catch(() =>
    redirect("/admin/login"),
  );
  try {
    return (
      <SubscriptionManagement
        report={await readSubscriptionManagement(p, user, await searchParams)}
      />
    );
  } catch (error) {
    if (!(error instanceof ContentError)) throw error;
    return (
      <main className="subscription-management">
        <h1>订阅管理</h1>
        <p role="alert">{error.message}</p>
        <a href="/subscription-center">重新打开订阅管理</a>
      </main>
    );
  }
}
