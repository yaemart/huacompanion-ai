import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { supportAuth } from "@/server/support/auth";
import BusinessDesk from "@/components/business/BusinessDesk";
import { inquiryCaseID } from "@/lib/intake-case";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  try {
    await supportAuth(await headers());
  } catch {
    redirect("/admin/login");
  }
  return <BusinessDesk initialCaseID={inquiryCaseID((await searchParams).id)} />;
}
