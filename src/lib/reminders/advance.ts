import type { SupabaseClient } from "@supabase/supabase-js";
import { sendReminderEmail } from "@/lib/email/resend";

export type PersonalReminderRow = {
  id: string;
  user_id: string;
  title: string;
  remind_at: string;
  recurrence: "once" | "daily" | "weekly";
  sound_enabled: boolean;
  email_enabled: boolean;
  is_active: boolean;
  last_fired_at: string | null;
  last_email_at: string | null;
};

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

/**
 * Fire a due reminder once: conditional update (idempotent), notification, optional email.
 * Works with user session client or service-role client.
 */
export async function advancePersonalReminderIfDue(
  supabase: SupabaseClient,
  row: PersonalReminderRow,
  userEmail: string | null,
  opts: { sendEmail: boolean }
): Promise<boolean> {
  const nowIso = new Date().toISOString();
  if (!row.is_active) return false;
  if (new Date(row.remind_at).getTime() > Date.now()) return false;

  const stillActive = row.recurrence !== "once";
  const nextRemind =
    row.recurrence === "daily"
      ? addDays(row.remind_at, 1)
      : row.recurrence === "weekly"
        ? addDays(row.remind_at, 7)
        : row.remind_at;

  const { data: updated, error } = await supabase
    .from("personal_reminders")
    .update({
      last_fired_at: nowIso,
      is_active: stillActive,
      remind_at: stillActive ? nextRemind : row.remind_at,
    })
    .eq("id", row.id)
    .eq("user_id", row.user_id)
    .lte("remind_at", nowIso)
    .select("id");

  if (error) throw new Error(error.message);
  if (!updated?.length) return false;

  await supabase.from("notifications").insert({
    user_id: row.user_id,
    type: "personal_reminder",
    title: "تذكير شخصي",
    body: row.title,
    payload: { reminder_id: row.id },
  });

  if (opts.sendEmail && row.email_enabled && userEmail) {
    try {
      await sendReminderEmail(userEmail, row.title);
      await supabase
        .from("personal_reminders")
        .update({ last_email_at: nowIso })
        .eq("id", row.id);
    } catch {
      /* email optional — do not fail reminder */
    }
  }

  return true;
}
