import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getValidatedSupabasePublicEnv } from "@/lib/supabase/public-env";

export async function createClient() {
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
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            /* called from a Server Component without mutable cookies */
          }
        },
      },
    }
  );
}
