"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/dashboard-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Deletes one activity row for the signed-in user (RLS). */
export async function deleteAiAgentActivityLogRowAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireSession();
  const supabase = await createClient();
  const rowId = id.trim();
  if (!rowId) {
    return { ok: false, error: "Invalid id." };
  }
  const { data, error } = await supabase
    .from("ai_agent_activity_log")
    .delete()
    .eq("id", rowId)
    .eq("user_id", session.id)
    .select("id");
  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data?.length) {
    return { ok: false, error: "Not found or not allowed." };
  }
  revalidatePath("/dashboard/ai-agent");
  return { ok: true };
}

/** Clears all log rows for the current user (RLS). */
export async function clearAiAgentActivityLogMineAction(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const session = await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.from("ai_agent_activity_log").delete().eq("user_id", session.id);
  if (error) {
    return { ok: false, error: error.message };
  }
  revalidatePath("/dashboard/ai-agent");
  return { ok: true };
}

/**
 * Super-admin only: deletes every row in `ai_agent_activity_log` using the service role,
 * bypassing RLS. Use sparingly; prefer per-user retention policies if logs grow large.
 */
export async function clearAiAgentActivityLogAllUsersAction(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const session = await requireSession();
  if (!session.isSuperAdmin) {
    return { ok: false, error: "Forbidden." };
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("ai_agent_activity_log")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) {
    return { ok: false, error: error.message };
  }
  revalidatePath("/dashboard/ai-agent");
  return { ok: true };
}
