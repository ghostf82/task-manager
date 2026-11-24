import { type NextRequest, NextResponse } from "next/server";
import {
  ISOLATED_COOKIE,
  isolatedAuthDecision,
  isolatedLoopbackEnabled,
} from "@/lib/sso/isolated-flag";
import { updateSession } from "@/lib/supabase/middleware";

function isolatedLoopbackResponse(request: NextRequest) {
  const decision = isolatedAuthDecision({
    pathname: request.nextUrl.pathname,
    tmSso: request.cookies.get(ISOLATED_COOKIE)?.value,
  });
  if (decision === "login") {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (decision === "dashboard") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return NextResponse.next({ request });
}

export async function middleware(request: NextRequest) {
  if (isolatedLoopbackEnabled()) {
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
