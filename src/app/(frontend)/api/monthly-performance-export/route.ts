import { checkOrigin, failure, limitedJSON } from "@/server/content/auth";
import { performanceAuth } from "@/server/performance/auth";
import { exportMonthlyPerformance } from "@/server/performance/monthly-export";

export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const { p, user } = await performanceAuth(req.headers);
    const result = await exportMonthlyPerformance(p, user, await limitedJSON(req, 8000));
    return new Response(result.csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Cache-Control": "private, no-store",
        "X-Export-Count": String(result.count),
      },
    });
  } catch (error) {
    return failure(error);
  }
}
