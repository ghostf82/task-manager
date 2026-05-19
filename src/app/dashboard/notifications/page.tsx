import { NotificationsPageClient } from "@/app/dashboard/notifications/notifications-page-client";
import { requireSession } from "@/lib/dashboard-auth";
import { getTranslator } from "@/lib/i18n/get-translator";
import { createClient } from "@/lib/supabase/server";

export default async function NotificationsPage() {
  const { t } = await getTranslator();
  const session = await requireSession();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notifications")
    .select("id,type,title,body,payload,read_at,archived_at,created_at")
    .eq("user_id", session.id)
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) {
    return (
      <p className="text-destructive text-sm">
        {t("notificationsPage.loadError")}: {error.message}
      </p>
    );
  }

  return (
    <NotificationsPageClient
      initialItems={(data ?? []).map((r) => ({
        id: String(r.id),
        type: String(r.type ?? "info"),
        title: String(r.title ?? ""),
        body: r.body == null ? null : String(r.body),
        payload:
          r.payload && typeof r.payload === "object" && !Array.isArray(r.payload)
            ? (r.payload as Record<string, unknown>)
            : null,
        created_at: String(r.created_at),
        read_at: r.read_at ? String(r.read_at) : null,
        archived_at: r.archived_at ? String(r.archived_at) : null,
      }))}
    />
  );
}
