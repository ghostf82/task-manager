import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
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
