import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isLegacyAiChatSessionId,
  isMissingColumn,
  isMissingTable,
  LEGACY_AI_CHAT_SESSION_ID,
} from "@/lib/supabase/schema-compat";

export { LEGACY_AI_CHAT_SESSION_ID, isLegacyAiChatSessionId };

/** Resolve DB session id, or legacy sentinel when sessions table/column is missing. */
export async function resolveAiChatSessionId(
  supabase: SupabaseClient,
  userId: string,
  sessionId?: string | null
): Promise<string> {
  const sid = sessionId?.trim();
  if (isLegacyAiChatSessionId(sid)) {
    const { error } = await supabase.from("ai_chat_sessions").select("id").limit(1);
    if (error && isMissingTable(error, "ai_chat_sessions")) {
      return LEGACY_AI_CHAT_SESSION_ID;
    }
  } else if (sid) {
    const { data, error } = await supabase
      .from("ai_chat_sessions")
      .select("id")
      .eq("id", sid)
      .eq("user_id", userId)
      .maybeSingle();
    if (data?.id) return data.id as string;
    if (error && isMissingTable(error, "ai_chat_sessions")) {
      return LEGACY_AI_CHAT_SESSION_ID;
    }
  }

  const { data: created, error } = await supabase
    .from("ai_chat_sessions")
    .insert({ user_id: userId, title: null })
    .select("id")
    .single();

  if (error && isMissingTable(error, "ai_chat_sessions")) {
    return LEGACY_AI_CHAT_SESSION_ID;
  }
  if (error || !created?.id) {
    throw new Error(error?.message ?? "تعذر إنشاء جلسة المحادثة");
  }
  return created.id as string;
}

export async function insertAiChatMessage(
  supabase: SupabaseClient,
  row: {
    user_id: string;
    session_id: string;
    role: string;
    body: string;
    metadata?: Record<string, unknown>;
  }
): Promise<{ error: { message: string } | null }> {
  if (isLegacyAiChatSessionId(row.session_id)) {
    const legacy = {
      user_id: row.user_id,
      role: row.role,
      body: row.body,
      metadata: row.metadata,
    };
    let { error } = await supabase.from("ai_chat_messages").insert(legacy);
    if (error && isMissingColumn(error, "session_id")) {
      ({ error } = await supabase.from("ai_chat_messages").insert(legacy));
    }
    return { error: error ? { message: error.message } : null };
  }

  let { error } = await supabase.from("ai_chat_messages").insert(row);
  if (error && isMissingColumn(error, "session_id")) {
    const legacy = {
      user_id: row.user_id,
      role: row.role,
      body: row.body,
      metadata: row.metadata,
    };
    ({ error } = await supabase.from("ai_chat_messages").insert(legacy));
  }
  return { error: error ? { message: error.message } : null };
}

export async function touchAiChatSession(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  patch: { updated_at: string; title?: string | null }
): Promise<void> {
  if (isLegacyAiChatSessionId(sessionId)) return;
  const { error } = await supabase
    .from("ai_chat_sessions")
    .update(patch)
    .eq("id", sessionId)
    .eq("user_id", userId);
  if (error && isMissingTable(error, "ai_chat_sessions")) return;
}

export async function fetchAiChatHistory(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  limit: number
): Promise<{ role: string; body: string }[]> {
  if (isLegacyAiChatSessionId(sessionId)) {
    const { data, error } = await supabase
      .from("ai_chat_messages")
      .select("role,body")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return [];
    return (data ?? []) as { role: string; body: string }[];
  }

  let { data, error } = await supabase
    .from("ai_chat_messages")
    .select("role,body")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error && isMissingColumn(error, "session_id")) {
    ({ data, error } = await supabase
      .from("ai_chat_messages")
      .select("role,body")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit));
  }

  if (error) return [];
  return (data ?? []) as { role: string; body: string }[];
}
