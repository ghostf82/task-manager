"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function errParam(code: string) {
  return `/login?error=${encodeURIComponent(code)}`;
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect(errParam("missing"));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(errParam("invalid"));
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function updatePasswordAction(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 6) {
    redirect("/update-password?error=short");
  }
  if (password !== confirm) {
    redirect("/update-password?error=mismatch");
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    redirect("/login?error=session");
  }

  const { error: pwdErr } = await supabase.auth.updateUser({ password });
  if (pwdErr) {
    redirect(`/update-password?error=${encodeURIComponent(pwdErr.message)}`);
  }

  const admin = createAdminClient();
  const { error: flagErr } = await admin
    .from("users")
    .update({ must_change_password: false })
    .eq("id", user.id);

  if (flagErr) {
    redirect(`/update-password?error=${encodeURIComponent(flagErr.message)}`);
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
