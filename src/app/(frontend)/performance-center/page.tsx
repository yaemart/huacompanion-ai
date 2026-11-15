import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { performanceAuth } from "@/server/performance/auth";
import { PerformanceDesk } from "@/components/performance/PerformanceDesk";
import { incidentSources } from "@/lib/performance-incidents";
import { inquiryCaseID } from "@/lib/intake-case";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "投诉、纠错与申诉 · 华伴",
  robots: { index: false, follow: false },
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; source?: string; record?: string }>;
}) {
  await performanceAuth(await headers()).catch(() => redirect("/admin/login"));
  const query = await searchParams;
  const source = incidentSources.find((value) => value === query.source);
  const record = inquiryCaseID(query.record);
  const id = inquiryCaseID(query.id);
  const target = source && record ? { source, record } : undefined;
  return <PerformanceDesk key={`${id}:${source}:${record}`} target={target} id={id} />;
}
