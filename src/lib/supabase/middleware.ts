import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getValidatedSupabasePublicEnv } from "@/lib/supabase/public-env";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const { url, anonKey } = getValidatedSupabasePublicEnv();

  const supabase = createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  /**
   * Do not query Postgres here. Netlify runs this middleware on Edge; an extra
   * PostgREST round-trip can crash or slow the edge function. Dashboard routes
   * enforce `must_change_password` via `requireSession()` in `dashboard-auth.ts`.
   */
  return { supabaseResponse, user };
}
