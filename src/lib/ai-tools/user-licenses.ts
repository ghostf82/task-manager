import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getRegisteredToolSlugs } from "@/lib/ai-tools/registry";

/** Active tool slugs licensed to the user and registered in code. */
export async function getLicensedActiveToolSlugs(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("user_ai_tools")
    .select("tool_slug")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (error || !data?.length) {
    return [];
  }

  const registered = new Set(getRegisteredToolSlugs());
  const licensed = new Set(data.map((r) => r.tool_slug as string));
  return getRegisteredToolSlugs().filter((s) => licensed.has(s) && registered.has(s));
}

export async function userHasAiToolLicense(
  supabase: SupabaseClient,
  userId: string,
  toolSlug: string
): Promise<boolean> {
  const slugs = await getLicensedActiveToolSlugs(supabase, userId);
  return slugs.includes(toolSlug);
}
