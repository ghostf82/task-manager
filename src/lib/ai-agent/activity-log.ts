import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export async function appendAgentActivity(
  supabase: SupabaseClient,
  row: {
    userId: string;
    proposalId?: string | null;
    eventType: string;
    message: string;
    meta?: Record<string, unknown>;
  }
) {
  const { error } = await supabase.from("ai_agent_activity_log").insert({
    user_id: row.userId,
    proposal_id: row.proposalId ?? null,
    event_type: row.eventType,
    message: row.message,
    meta: row.meta ?? {},
  });
  if (error) {
    console.error("appendAgentActivity", error);
  }
}
