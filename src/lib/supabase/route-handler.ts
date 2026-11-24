import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";

import { isPlatformGrantBlocking } from "@/lib/sso/grant-gate";
import { getValidatedSupabasePublicEnv } from "@/lib/supabase/public-env";

/** Supabase client for Route Handlers (session read; no cookie mutation). */
export async function createRouteSupabaseClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getValidatedSupabasePublicEnv();
  return createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          /* read-only export/cron routes */
        },
      },
    }
  );
}

/** Session user for sensitive API routes. Platform grant revoke denies even with a leftover cookie. */
export async function getRouteUser(): Promise<{
  supabase: Awaited<ReturnType<typeof createRouteSupabaseClient>>;
  user: User | null;
}> {
  const supabase = await createRouteSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null };
  if (await isPlatformGrantBlocking(user.id, user.last_sign_in_at ?? null)) {
    return { supabase, user: null };
  }
  return { supabase, user };
}
