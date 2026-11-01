import { isLocale } from "./lib/locales";
import { NextResponse, type NextRequest } from "next/server";
import { indexingAllowed, privateSearchPath } from "./lib/seo";
export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname.replace(/\/+$/, "");
  if (pathname === "/api/staff/first-register")
    return NextResponse.json(
      { error: "Public employee registration is disabled." },
      { status: 403 },
    );
  if (pathname === "/admin/create-first-user")
    return NextResponse.redirect(new URL("/admin/login", request.url));
  const headers = new Headers(request.headers);
  const locale = request.nextUrl.pathname.split("/")[1];
  headers.set("x-hua-locale", isLocale(locale) ? locale : "zh");
  const response = NextResponse.next({ request: { headers } });
  if (!indexingAllowed() || privateSearchPath(pathname))
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
export const config = { matcher: ["/((?!_next|favicon.ico|shanghai.svg).*)"] };
