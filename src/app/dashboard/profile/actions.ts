"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/dashboard-auth";
import { createClient } from "@/lib/supabase/server";

export async function setAvatarUrlAction(publicUrl: string | null) {
  const session = await requireSession();
  const supabase = await createClient();
  const url =
    publicUrl === null || publicUrl === undefined || !String(publicUrl).trim()
      ? null
      : String(publicUrl).trim();
  const { error } = await supabase
    .from("users")
    .update({ avatar_url: url })
    .eq("id", session.id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/profile");
  revalidatePath("/dashboard");
}

export async function updateProfileAction(formData: FormData) {
  const session = await requireSession();
  const full_name = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("users")
    .update({ full_name: full_name || null, phone })
    .eq("id", session.id);
  if (error) throw new Error(error.message);
  redirect("/dashboard/profile?saved=1");
}
