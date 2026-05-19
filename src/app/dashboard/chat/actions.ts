"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/dashboard-auth";
import { tAction } from "@/lib/i18n/action-messages";
import { createClient } from "@/lib/supabase/server";

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

export async function createAiChatSessionAction(title?: string | null): Promise<string> {
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
  if (error || !data?.id) throw new Error(error?.message ?? (await tAction("errors.chat.createSessionFailed")));
  revalidatePath("/dashboard/chat");
  return data.id as string;
}

export async function listAiChatSessionsAction(): Promise<AiChatSessionRow[]> {
  const session = await requireSession();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_chat_sessions")
    .select("id,title,created_at,updated_at")
    .eq("user_id", session.id)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as AiChatSessionRow[];
}

export async function deleteAiChatSessionsAction(sessionIds: string[]) {
  const session = await requireSession();
  if (!sessionIds.length) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("ai_chat_sessions")
    .delete()
    .eq("user_id", session.id)
    .in("id", sessionIds);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/chat");
}

export async function deleteAllAiChatSessionsAction() {
  const session = await requireSession();
  const supabase = await createClient();
  const { error } = await supabase
    .from("ai_chat_sessions")
    .delete()
    .eq("user_id", session.id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/chat");
}
