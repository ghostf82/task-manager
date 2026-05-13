import { ChatClient, type ChatColleague } from "@/app/dashboard/chat/chat-client";
import { requireSession } from "@/lib/dashboard-auth";
import { getTranslator } from "@/lib/i18n/get-translator";
import { createClient } from "@/lib/supabase/server";

export default async function ChatPage() {
  const { t, locale } = await getTranslator();
  const session = await requireSession();
  const supabase = await createClient();

  let colleagues: ChatColleague[] = [];

  const { data: meRow } = await supabase
    .from("users")
    .select("full_name,email")
    .eq("id", session.id)
    .single();
  const currentUserName = meRow?.full_name?.trim() || meRow?.email || t("chatPage.fallbackYou");

  if (session.isSuperAdmin) {
    const { data } = await supabase
      .from("users")
      .select("id,full_name,email,avatar_url")
      .neq("id", session.id)
      .order("full_name", { ascending: true })
      .limit(100);
    colleagues =
      (data ?? []).map((u) => ({
        id: u.id,
        full_name: u.full_name,
        email: u.email,
        avatar_url: u.avatar_url,
      })) ?? [];
  } else {
    const { data: mine } = await supabase
      .from("tenant_memberships")
      .select("tenant_id")
      .eq("user_id", session.id)
      .eq("status", "active");
    const tids = [...new Set((mine ?? []).map((m) => m.tenant_id as string))];
    if (tids.length) {
      const { data: mems } = await supabase
        .from("tenant_memberships")
        .select("user_id, users ( id, full_name, email, avatar_url )")
        .in("tenant_id", tids)
        .eq("status", "active")
        .neq("user_id", session.id);

      const map = new Map<string, ChatColleague>();
      for (const row of mems ?? []) {
        const raw = row.users as
          | { id: string; full_name: string | null; email: string; avatar_url: string | null }
          | Array<{
              id: string;
              full_name: string | null;
              email: string;
              avatar_url: string | null;
            }>
          | null;
        const u = Array.isArray(raw) ? raw[0] : raw;
        if (u?.id && u.id !== session.id) {
          map.set(u.id, {
            id: u.id,
            full_name: u.full_name,
            email: u.email,
            avatar_url: u.avatar_url,
          });
        }
      }
      const collator = locale === "en" ? "en" : "ar";
      colleagues = [...map.values()].sort((a, b) =>
        (a.full_name || a.email).localeCompare(b.full_name || b.email, collator)
      );
    }
  }

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight">{t("chatPage.title")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("chatPage.subtitle")}</p>
      </div>
      <ChatClient
        className="min-h-0 flex-1"
        currentUserId={session.id}
        currentUserName={currentUserName}
        colleagues={colleagues}
      />
    </div>
  );
}
