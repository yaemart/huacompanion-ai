import { NextResponse, type NextRequest } from "next/server";
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
  headers.set(
    "x-hua-locale",
    /^\/zh(?:\/|$)/.test(request.nextUrl.pathname) ? "zh-CN" : "en",
  );
  return NextResponse.next({ request: { headers } });
}
export const config = { matcher: ["/((?!_next|favicon.ico|shanghai.svg).*)"] };
