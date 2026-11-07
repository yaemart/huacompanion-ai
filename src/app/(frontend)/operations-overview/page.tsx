import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { supportAuth } from "@/server/support/auth";
import OperationsOverview from "@/components/reporting/OperationsOverview";
export const dynamic = "force-dynamic";
export default async function Page() {
  try {
    await supportAuth(await headers());
  } catch {
    redirect("/admin/login");
  }
  return <OperationsOverview />;
}
