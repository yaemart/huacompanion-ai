import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ContentError } from "@/server/content/error";
import { performanceAuth } from "@/server/performance/auth";
import { readMonthlyPerformance } from "@/server/performance/monthly";
import { MonthlyPerformance } from "@/components/performance/MonthlyPerformance";
import "@/components/performance/performance.css";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "个人业绩与月报 · 华伴",
  robots: { index: false, follow: false },
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ month?: string | string[]; staff?: string | string[] }>;
}) {
  const { p, user } = await performanceAuth(await headers()).catch(() => redirect("/admin/login"));
  const query = await searchParams;
  try {
    return <MonthlyPerformance report={await readMonthlyPerformance(p, user, query)} />;
  } catch (error) {
    if (!(error instanceof ContentError)) throw error;
    return (
      <main className="performance-desk">
        <h1>个人业绩与月报</h1>
        <p role="alert">{error.message}</p>
        <a href="/performance-center/monthly">返回月报</a>
      </main>
    );
  }
}
