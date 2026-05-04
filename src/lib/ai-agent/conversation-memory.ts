import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type MemoryRow = {
  id: string;
  user_id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

const DEFAULT_SESSION = "default";

export async function appendConversationMemory(
  supabase: SupabaseClient,
  input: {
    userId: string;
    sessionId?: string;
    role: MemoryRow["role"];
    content: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const session_id = input.sessionId?.trim() || DEFAULT_SESSION;
  const content = input.content.trim();
  if (!content) return;

  await supabase.from("ai_conversation_memory").insert({
    user_id: input.userId,
    session_id,
    role: input.role,
    content,
    metadata: input.metadata ?? {},
  });
}

export async function getRecentMemory(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  limit = 10
): Promise<MemoryRow[]> {
  const sid = sessionId.trim() || DEFAULT_SESSION;
  const { data, error } = await supabase
    .from("ai_conversation_memory")
    .select("id,user_id,session_id,role,content,metadata,created_at")
    .eq("user_id", userId)
    .eq("session_id", sid)
    .order("created_at", { ascending: false })
    .limit(Math.min(50, Math.max(1, limit)));

  if (error) {
    console.error("getRecentMemory", error.message);
    return [];
  }

  const rows = (data ?? []) as MemoryRow[];
  return rows.slice().reverse();
}
