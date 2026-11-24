import { type NextRequest, NextResponse } from "next/server";
import {
  ISOLATED_COOKIE,
  ISOLATED_COOKIE_CLEAR,
  isolatedAuthDecision,
  isolatedLoopbackEnabled,
  peekIsolatedSidLive,
} from "@/lib/sso/isolated-flag";
import { updateSession } from "@/lib/supabase/middleware";

function isolatedLoopbackResponse(request: NextRequest) {
  const tmSso = request.cookies.get(ISOLATED_COOKIE)?.value;
  const live = peekIsolatedSidLive(tmSso);
  const decision = isolatedAuthDecision({
    pathname: request.nextUrl.pathname,
    tmSso,
    live,
  });
  let response: NextResponse;
  if (decision === "login") {
    response = NextResponse.redirect(new URL("/login", request.url));
  } else if (decision === "dashboard") {
    response = NextResponse.redirect(new URL("/dashboard", request.url));
  } else {
    response = NextResponse.next({ request });
  }
  if (live === false && tmSso?.trim()) {
    response.cookies.set(ISOLATED_COOKIE, "", ISOLATED_COOKIE_CLEAR);
  }
  return response;
}

export async function middleware(request: NextRequest) {
  if (isolatedLoopbackEnabled(process.env, request.nextUrl.hostname)) {
    return isolatedLoopbackResponse(request);
  }

  const { supabaseResponse, user } = await updateSession(request);

  const pathname = request.nextUrl.pathname;

  if (!user) {
    if (pathname.startsWith("/dashboard") || pathname === "/update-password") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return supabaseResponse;
  }

  /** Logged-in users may finish forced password change; do not redirect to /dashboard first. */
  if (pathname === "/update-password") {
    return supabaseResponse;
  }

  if (pathname === "/login" || pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
