import type { SupabaseClient } from "@supabase/supabase-js";

export type OdooBrowserCacheKind = "workspace" | "tasks" | "projects" | "events" | "documents";

export async function upsertOdooBrowserCache(
  supabase: SupabaseClient,
  userId: string,
  kind: OdooBrowserCacheKind,
  payload: unknown,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.from("odoo_browser_cache").upsert(
    {
      user_id: userId,
      kind,
      payload: payload as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,kind" },
  );
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true };
}
