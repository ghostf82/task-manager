import { requireSession } from "@/lib/dashboard-auth";
import { getTranslator } from "@/lib/i18n/get-translator";
import { createClient } from "@/lib/supabase/server";
import {
  RemindersApp,
  type ReminderRow,
} from "@/app/dashboard/reminders/reminders-app";

export default async function RemindersPage() {
  const { t } = await getTranslator();
  await requireSession();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("personal_reminders")
    .select(
      "id,title,remind_at,recurrence,sound_enabled,email_enabled,is_active"
    )
    .order("remind_at", { ascending: true });

  if (error) {
    return (
      <p className="text-destructive text-sm">
        {t("remindersPage.loadError")}: {error.message}
      </p>
    );
  }

  return <RemindersApp initial={(data ?? []) as ReminderRow[]} />;
}
