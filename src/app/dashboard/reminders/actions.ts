"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/dashboard-auth";
import { createClient } from "@/lib/supabase/server";
import {
  advancePersonalReminderIfDue,
  type PersonalReminderRow,
} from "@/lib/reminders/advance";

export type ReminderInput = {
  title: string;
  remind_at: string;
  recurrence: "once" | "daily" | "weekly";
  sound_enabled: boolean;
  email_enabled: boolean;
};

export async function createPersonalReminderAction(input: ReminderInput) {
  const session = await requireSession();
  if (!input.title.trim()) throw new Error("عنوان التذكير مطلوب");

  const supabase = await createClient();
  const { error } = await supabase.from("personal_reminders").insert({
    user_id: session.id,
    title: input.title.trim(),
    remind_at: input.remind_at,
    recurrence: input.recurrence,
    sound_enabled: input.sound_enabled,
    email_enabled: input.email_enabled,
    is_active: true,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/reminders");
}

export async function updatePersonalReminderAction(
  id: string,
  input: ReminderInput
) {
  const session = await requireSession();
  const supabase = await createClient();
  const { error } = await supabase
    .from("personal_reminders")
    .update({
      title: input.title.trim(),
      remind_at: input.remind_at,
      recurrence: input.recurrence,
      sound_enabled: input.sound_enabled,
      email_enabled: input.email_enabled,
    })
    .eq("id", id)
    .eq("user_id", session.id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/reminders");
}

export async function deletePersonalReminderAction(id: string) {
  const session = await requireSession();
  const supabase = await createClient();
  const { error } = await supabase
    .from("personal_reminders")
    .delete()
    .eq("id", id)
    .eq("user_id", session.id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/reminders");
}

export async function toggleReminderActiveAction(id: string, isActive: boolean) {
  const session = await requireSession();
  const supabase = await createClient();
  const { error } = await supabase
    .from("personal_reminders")
    .update({ is_active: isActive })
    .eq("id", id)
    .eq("user_id", session.id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/reminders");
}

/** Called periodically from the client while the app is open. */
export async function tickPersonalRemindersAction(): Promise<{
  fired: number;
  playSound: boolean;
}> {
  const session = await requireSession();
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const { data: emailRow } = await supabase
    .from("users")
    .select("email")
    .eq("id", session.id)
    .single();

  const { data: due } = await supabase
    .from("personal_reminders")
    .select("*")
    .eq("user_id", session.id)
    .eq("is_active", true)
    .lte("remind_at", nowIso);

  let fired = 0;
  let playSound = false;

  for (const raw of due ?? []) {
    const row = raw as PersonalReminderRow;
    const ok = await advancePersonalReminderIfDue(
      supabase,
      row,
      emailRow?.email ?? null,
      { sendEmail: true }
    );
    if (ok) {
      fired++;
      if (row.sound_enabled) playSound = true;
    }
  }

  if (fired) {
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/reminders");
  }

  return { fired, playSound };
}
