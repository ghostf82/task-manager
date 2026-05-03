import { requireSession } from "@/lib/dashboard-auth";
import { createClient } from "@/lib/supabase/server";
import {
  RemindersApp,
  type ReminderRow,
} from "@/app/dashboard/reminders/reminders-app";

export default async function RemindersPage() {
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
        تعذر تحميل التذكيرات: {error.message}
      </p>
    );
  }

  return <RemindersApp initial={(data ?? []) as ReminderRow[]} />;
}
