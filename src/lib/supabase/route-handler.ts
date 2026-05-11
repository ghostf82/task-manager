import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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
