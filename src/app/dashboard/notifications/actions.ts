"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/dashboard-auth";
import { createClient } from "@/lib/supabase/server";

export async function markNotificationsReadAction(ids: string[]) {
  await requireSession();
  if (!ids.length) return;
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: now })
    .in("id", ids);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/notifications");
}

export async function archiveNotificationsAction(ids: string[]) {
  const session = await requireSession();
  if (!ids.length) return;
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("notifications")
    .update({ archived_at: now, read_at: now })
    .eq("user_id", session.id)
    .in("id", ids);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/notifications");
}

export async function deleteNotificationsAction(ids: string[]) {
  const session = await requireSession();
  if (!ids.length) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("user_id", session.id)
    .in("id", ids);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/notifications");
}

/** Create a one-shot personal reminder from a notification (reuse). */
export async function reuseNotificationAsReminderAction(notificationId: string) {
  const session = await requireSession();
  const supabase = await createClient();
  const { data: row, error: fetchErr } = await supabase
    .from("notifications")
    .select("id,title,body")
    .eq("user_id", session.id)
    .eq("id", notificationId)
    .maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message);
  if (!row) throw new Error("Notification not found");

  const remindAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const title = [row.title, row.body].filter(Boolean).join(" — ").slice(0, 200) || "تذكير";

  const { error } = await supabase.from("personal_reminders").insert({
    user_id: session.id,
    title,
    remind_at: remindAt,
    recurrence: "once",
    sound_enabled: true,
    email_enabled: false,
    is_active: true,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/reminders");
  revalidatePath("/dashboard/notifications");
  return { remindAt };
}
