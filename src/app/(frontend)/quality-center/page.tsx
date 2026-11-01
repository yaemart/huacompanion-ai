import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { contentAuth } from "@/server/content/auth";
import { QualityCenter } from "@/components/quality/QualityCenter";
export const dynamic = "force-dynamic";
export const metadata = { title: "内容质量 · 华伴", robots: { index: false, follow: false } };
export default async function Page() {
  try {
    await contentAuth(await headers());
  } catch {
    redirect("/admin/login");
  }
  return <QualityCenter />;
}
