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
}
