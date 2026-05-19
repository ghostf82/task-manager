import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadOdooBrowserSessionBundle, loadOdooConnectionState } from "@/lib/ai-agent/load-user-integrations";
import { enrichOdooWebTasksToUiRows } from "@/lib/integrations/odoo-task-enrich";
import { searchOdooTasksViaWebLogin } from "@/lib/integrations/odoo-client";

export async function listOdooTasksForChat(
  supabase: SupabaseClient,
  userId: string,
  input?: { text?: string; limit?: number; mineOnly?: boolean }
): Promise<{ ok: true; tasks: Awaited<ReturnType<typeof enrichOdooWebTasksToUiRows>> } | { ok: false; error: string }> {
  const mode = await loadOdooConnectionState(supabase, userId);
  if (mode.mode !== "browser_session") {
    return {
      ok: false,
      error: "مهام Odoo تتطلب تفعيل Browser Session Mode من إعدادات التكاملات.",
    };
  }
  const bundle = await loadOdooBrowserSessionBundle(supabase, userId);
  if (!bundle) {
    return { ok: false, error: "بيانات Odoo في Browser Session غير مكتملة." };
  }
  const res = await searchOdooTasksViaWebLogin({
    bundle,
    text: input?.text,
    limit: input?.limit ?? 30,
    mineOnly: Boolean(input?.mineOnly),
  });
  if (res.error && !res.tasks.length) {
    return { ok: false, error: res.error };
  }
  const tasks = await enrichOdooWebTasksToUiRows(bundle, res.tasks);
  return { ok: true, tasks };
}
