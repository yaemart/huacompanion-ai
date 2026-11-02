import { trialAccess } from "./lib/trial-access";
import { isLocale } from "./lib/locales";
import { NextResponse, type NextRequest } from "next/server";
import { indexingAllowed, privateSearchPath } from "./lib/seo";
export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname.replace(/\/+$/, "");
  // A liveness-only response; no database, credentials or business data.
  if (pathname === "/api/health" && ["GET", "HEAD"].includes(request.method))
    return new NextResponse(request.method === "HEAD" ? null : "ok", {
      headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
    });
  const access = trialAccess(request.headers.get("authorization"));
  if (!["disabled", "allowed"].includes(access)) {
    const unauthorized = access === "unauthorized";
    return new NextResponse(unauthorized ? "Restricted trial" : "Trial unavailable", {
      status: unauthorized ? 401 : 503,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
        ...(unauthorized ? { "WWW-Authenticate": 'Basic realm="Hua trial", charset="UTF-8"' } : {}),
      },
    });
  }
  if (pathname === "/api/staff/first-register")
    return NextResponse.json(
      { error: "Public employee registration is disabled." },
      { status: 403 },
    );
  if (pathname === "/admin/create-first-user")
    return NextResponse.redirect(new URL("/admin/login", request.url));
  const headers = new Headers(request.headers);
  if (access === "allowed") headers.delete("authorization");
  const locale = request.nextUrl.pathname.split("/")[1];
  headers.set("x-hua-locale", isLocale(locale) ? locale : "zh");
  const response = NextResponse.next({ request: { headers } });
  if (access === "allowed") response.headers.set("Cache-Control", "private, no-store");
  if (access === "allowed" || !indexingAllowed() || privateSearchPath(pathname))
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
export const config = { matcher: ["/:path*"] };
