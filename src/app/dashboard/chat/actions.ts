"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import {
  deleteAiChatMessagesForSessions,
  deleteAllAiChatMessagesForUser,
} from "@/lib/ai-chat/session-compat";
import { requireSession } from "@/lib/dashboard-auth";
import { tAction } from "@/lib/i18n/action-messages";
import { createClient } from "@/lib/supabase/server";
import {
  isLegacyAiChatSessionId,
  isMissingTable,
  LEGACY_AI_CHAT_SESSION_ID,
} from "@/lib/supabase/schema-compat";

export type AiChatActionResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

async function fail(message: string): Promise<{ ok: false; error: string }> {
  return { ok: false, error: message };
}

async function actionError(e: unknown, fallbackKey: string): Promise<string> {
  if (e instanceof Error && e.message.trim()) return e.message;
  return tAction(fallbackKey);
}

async function findSharedTenant(
  supabase: SupabaseClient,
  a: string,
  b: string
): Promise<string | null> {
  const [{ data: ma }, { data: mb }] = await Promise.all([
    supabase
      .from("tenant_memberships")
      .select("tenant_id")
      .eq("user_id", a)
      .eq("status", "active"),
    supabase
      .from("tenant_memberships")
      .select("tenant_id")
      .eq("user_id", b)
      .eq("status", "active"),
  ]);
  const setA = new Set((ma ?? []).map((x) => x.tenant_id as string));
  for (const row of mb ?? []) {
    const tid = row.tenant_id as string;
    if (setA.has(tid)) return tid;
  }
  return null;
}

export async function ensureDmConversationAction(otherUserId: string) {
  const session = await requireSession();
  if (!otherUserId || otherUserId === session.id) {
    throw new Error(await tAction("errors.chat.invalidUser"));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error(await tAction("errors.chat.unauthorized"));

  const { data: meRow } = await supabase
    .from("users")
    .select("is_super_admin")
    .eq("id", user.id)
    .single();
  const isSuper = Boolean(meRow?.is_super_admin);

  const dmKey = [user.id, otherUserId].sort().join("_");

  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("dm_key", dmKey)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  let tenantId: string | null = null;
  if (!isSuper) {
    tenantId = await findSharedTenant(supabase, user.id, otherUserId);
    if (!tenantId) {
      throw new Error(await tAction("errors.chat.sameCompanyOnly"));
    }
  }

  const { data: conv, error: cErr } = await supabase
    .from("conversations")
    .insert({
      kind: "dm",
      dm_key: dmKey,
      created_by: user.id,
      tenant_id: tenantId,
      title: null,
    })
    .select("id")
    .single();

  if (cErr || !conv) {
    const { data: again } = await supabase
      .from("conversations")
      .select("id")
      .eq("dm_key", dmKey)
      .maybeSingle();
    if (again?.id) return again.id as string;
    throw new Error(cErr?.message ?? (await tAction("errors.chat.createConversationFailed")));
  }

  const cid = conv.id as string;

  const { error: p1 } = await supabase.from("conversation_participants").insert({
    conversation_id: cid,
    user_id: user.id,
  });
  if (p1) throw new Error(p1.message);

  const { error: p2 } = await supabase.from("conversation_participants").insert({
    conversation_id: cid,
    user_id: otherUserId,
  });
  if (p2) throw new Error(p2.message);

  revalidatePath("/dashboard/chat");
  return cid;
}

export async function sendChatMessageAction(
  conversationId: string,
  body: string
) {
  const session = await requireSession();
  const text = body.trim();
  if (!text) throw new Error(await tAction("errors.chat.emptyMessage"));

  const supabase = await createClient();
  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    user_id: session.id,
    body: text,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/chat");
}

export type AiChatSessionRow = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

export async function createAiChatSessionAction(
  title?: string | null
): Promise<AiChatActionResult<{ sessionId: string }>> {
  try {
    const session = await requireSession();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("ai_chat_sessions")
      .insert({
        user_id: session.id,
        title: title?.trim() || null,
      })
      .select("id")
      .single();
    if (error && isMissingTable(error, "ai_chat_sessions")) {
      return { ok: true, data: { sessionId: LEGACY_AI_CHAT_SESSION_ID } };
    }
    if (error || !data?.id) {
      return fail(error?.message ?? (await tAction("errors.chat.createSessionFailed")));
    }
    return { ok: true, data: { sessionId: data.id as string } };
  } catch (e) {
    return fail(await actionError(e, "errors.chat.createSessionFailed"));
  }
}

export async function listAiChatSessionsAction(): Promise<
  AiChatActionResult<{ sessions: AiChatSessionRow[] }>
> {
  try {
    const session = await requireSession();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("ai_chat_sessions")
      .select("id,title,created_at,updated_at")
      .eq("user_id", session.id)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error && isMissingTable(error, "ai_chat_sessions")) {
      return { ok: true, data: { sessions: [] } };
    }
    if (error) return fail(error.message);
    return { ok: true, data: { sessions: (data ?? []) as AiChatSessionRow[] } };
  } catch (e) {
    return fail(await actionError(e, "errors.chat.sessionsLoadFailed"));
  }
}

export async function deleteAiChatSessionsAction(
  sessionIds: string[]
): Promise<AiChatActionResult> {
  try {
    const session = await requireSession();
    const ids = sessionIds.filter((id) => id && !isLegacyAiChatSessionId(id));
    if (!ids.length) return { ok: true };

    const supabase = await createClient();
    const msgRes = await deleteAiChatMessagesForSessions(supabase, session.id, ids);
    if (msgRes.error) return fail(msgRes.error);

    const { error } = await supabase
      .from("ai_chat_sessions")
      .delete()
      .eq("user_id", session.id)
      .in("id", ids);

    if (error && isMissingTable(error, "ai_chat_sessions")) {
      return { ok: true };
    }
    if (error) return fail(error.message);
    return { ok: true };
  } catch (e) {
    return fail(await actionError(e, "errors.chat.deleteSessionsFailed"));
  }
}

export async function deleteAllAiChatSessionsAction(): Promise<AiChatActionResult> {
  try {
    const session = await requireSession();
    const supabase = await createClient();

    const msgRes = await deleteAllAiChatMessagesForUser(supabase, session.id);
    if (msgRes.error) return fail(msgRes.error);

    const { error } = await supabase
      .from("ai_chat_sessions")
      .delete()
      .eq("user_id", session.id);

    if (error && isMissingTable(error, "ai_chat_sessions")) {
      return { ok: true };
    }
    if (error) return fail(error.message);

    return { ok: true };
  } catch (e) {
    return fail(await actionError(e, "errors.chat.deleteSessionsFailed"));
  }
}
