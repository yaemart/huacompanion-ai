import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { supportPayload } from "@/server/support/auth";
import { authenticateCrm } from "@/server/crm/access";
import ClientDirectory from "@/components/crm/ClientDirectory";
export const dynamic = "force-dynamic";
export const metadata = { title: "客户档案 · 华伴", robots: { index: false, follow: false } };
export default async function Page() {
  const p = await supportPayload();
  try {
    await authenticateCrm(p, await headers());
  } catch {
    redirect("/admin/login");
  }
  return <ClientDirectory />;
}
