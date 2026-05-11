import { createClient } from "@supabase/supabase-js";

import { getValidatedSupabasePublicEnv } from "@/lib/supabase/public-env";

/**
 * Service-role client: use only in Server Actions / Route Handlers after the caller is verified.
 * Never import this module from Client Components.
 */
export function createAdminClient() {
  const { url } = getValidatedSupabasePublicEnv();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
