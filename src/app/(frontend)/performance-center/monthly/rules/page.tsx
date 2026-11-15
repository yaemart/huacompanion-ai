import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ScorecardEditor } from "@/components/performance/ScorecardEditor";
import { ContentError } from "@/server/content/error";
import { performanceAuth } from "@/server/performance/auth";
import { readScorecardSettings } from "@/server/performance/scorecard-settings";
import { chinaDay } from "@/lib/staff-today";
import "@/components/performance/performance.css";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "评分规则 · 华伴",
  robots: { index: false, follow: false },
};

export default async function Page() {
  const { p, user } = await performanceAuth(await headers()).catch(() => redirect("/admin/login"));
  try {
    const settings = await readScorecardSettings(p, user);
    const earliest = new Date(chinaDay(Date.now()).date.slice(0, 7) + "-01T00:00:00Z");
    earliest.setUTCMonth(earliest.getUTCMonth() + 1);
    return <ScorecardEditor initial={settings} earliest={earliest.toISOString().slice(0, 7)} />;
  } catch (error) {
    if (!(error instanceof ContentError)) throw error;
    return (
      <main className="performance-desk">
        <h1>评分规则</h1>
        <p role="alert">{error.message}</p>
        <a href="/performance-center/monthly">返回月报</a>
      </main>
    );
  }
}
