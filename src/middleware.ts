import { NextResponse, type NextRequest } from "next/server";
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set(
    "x-hua-locale",
    /^\/zh(?:\/|$)/.test(request.nextUrl.pathname) ? "zh-CN" : "en",
  );
  return NextResponse.next({ request: { headers } });
}
export const config = { matcher: ["/((?!_next|favicon.ico|shanghai.svg).*)"] };
