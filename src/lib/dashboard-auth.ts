import { redirect } from "next/navigation";
import { isPlatformGrantBlocking } from "@/lib/sso/grant-gate";
import { createClient } from "@/lib/supabase/server";

export type SessionUser = {
  id: string;
  email: string | undefined;
  isSuperAdmin: boolean;
  mustChangePassword: boolean;
};

export async function requireSession(): Promise<SessionUser> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  if (await isPlatformGrantBlocking(user.id)) {
    await supabase.auth.signOut();
    redirect("/login?error=sso_grant");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("must_change_password, is_super_admin")
    .eq("id", user.id)
    .single();

  if (profile?.must_change_password) redirect("/update-password");

  return {
    id: user.id,
    email: user.email,
    isSuperAdmin: Boolean(profile?.is_super_admin),
    mustChangePassword: Boolean(profile?.must_change_password),
  };
}

export async function requireSuperAdmin(): Promise<SessionUser> {
  const u = await requireSession();
  if (!u.isSuperAdmin) redirect("/dashboard");
  return u;
}
