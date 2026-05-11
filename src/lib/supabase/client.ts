import { createBrowserClient } from "@supabase/ssr";

import { getValidatedSupabasePublicEnv } from "@/lib/supabase/public-env";

export function createClient() {
  const { url, anonKey } = getValidatedSupabasePublicEnv();
  return createBrowserClient(url, anonKey);
}
