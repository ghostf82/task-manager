import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user, mustChangePassword } =
    await updateSession(request);

  const pathname = request.nextUrl.pathname;
  const isAuthPath =
    pathname === "/login" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/error");

  if (!user) {
    if (pathname.startsWith("/dashboard") || pathname === "/update-password") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return supabaseResponse;
  }

  if (mustChangePassword) {
    if (!isAuthPath && pathname !== "/update-password") {
      return NextResponse.redirect(new URL("/update-password", request.url));
    }
    if (pathname === "/login") {
      return NextResponse.redirect(new URL("/update-password", request.url));
    }
    return supabaseResponse;
  }

  if (pathname === "/login" || pathname === "/" || pathname === "/update-password") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
