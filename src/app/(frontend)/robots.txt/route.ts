import { robotsContents } from "@/lib/seo";
export const dynamic = "force-dynamic";
export function GET() {
  const origin = new URL(process.env.APP_URL || "http://127.0.0.1:3000").origin;
  return new Response(robotsContents(origin), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
