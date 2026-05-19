import { NotificationsPageClient } from "@/app/dashboard/notifications/notifications-page-client";
import { requireSession } from "@/lib/dashboard-auth";
import { getTranslator } from "@/lib/i18n/get-translator";
import { fetchNotificationsForUser } from "@/lib/notifications/queries";
import { createClient } from "@/lib/supabase/server";

export default async function NotificationsPage() {
  const { t } = await getTranslator();
  const session = await requireSession();
  const supabase = await createClient();

  const result = await fetchNotificationsForUser(supabase, {
    userId: session.id,
    limit: 80,
  });

  if (!result.ok) {
    return (
      <p className="text-destructive text-sm">
        {t("notificationsPage.loadError")}
      </p>
    );
  }

  return (
    <NotificationsPageClient
      initialItems={result.rows.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        payload: n.payload,
        created_at: n.created_at,
        read_at: n.read_at,
        archived_at: n.archived_at,
      }))}
      supportsArchive={result.supportsArchive}
    />
  );
}
