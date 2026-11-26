"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSb } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getValidatedSupabasePublicEnv } from "@/lib/supabase/public-env";

function errParam(code: string) {
  return `/login?error=${encodeURIComponent(code)}`;
}

const CENTRAL_LOGIN_URL =
  process.env.HR_CENTRAL_LOGIN_URL?.trim() ||
  "https://hr-reports-staging.netlify.app/api/program-central-login";

async function tryCentralTasksLogin(email: string, password: string): Promise<{
  ok: boolean;
  platformUserId?: string;
}> {
  try {
    const res = await fetch(CENTRAL_LOGIN_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "tasks", identifier: email, password }),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      platform_user_id?: string;
    };
    if (!res.ok || !body.ok || !body.platform_user_id) return { ok: false };
    return { ok: true, platformUserId: body.platform_user_id };
  } catch {
    return { ok: false };
  }
}

async function mintLocalSessionFromCentral(email: string, platformUserId: string) {
  const admin = createAdminClient();
  const { url } = getValidatedSupabasePublicEnv();
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  const lookup = await fetch(`${url}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
    },
    cache: "no-store",
  });
  let userId: string | null = null;
  if (lookup.ok) {
    const payload = await lookup.json().catch(() => null);
    const users = Array.isArray(payload?.users) ? payload.users : [];
    const hit = users.find((u: { email?: string }) => String(u.email || "").toLowerCase() === email);
    userId = hit?.id || null;
  }
  if (!userId) {
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { provisioned_by: "tasks-central-login" },
      app_metadata: { hr_platform_user_id: platformUserId },
    });
    if (created.error || !created.data.user) {
      throw new Error(created.error?.message || "local_create_failed");
    }
    userId = created.data.user.id;
  } else {
    await admin.auth.admin.updateUserById(userId, {
      app_metadata: { hr_platform_user_id: platformUserId },
    });
  }

  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error || !link.data.properties?.hashed_token) {
    throw new Error(link.error?.message || "magiclink_failed");
  }
  return link.data.properties.hashed_token as string;
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect(errParam("missing"));
  }

  const central = await tryCentralTasksLogin(email, password);
  if (central.ok && central.platformUserId) {
    try {
      const tokenHash = await mintLocalSessionFromCentral(email, central.platformUserId);
      const supabase = await createClient();
      const { error } = await supabase.auth.verifyOtp({
        type: "magiclink",
        token_hash: tokenHash,
      });
      if (!error) {
        revalidatePath("/", "layout");
        redirect("/dashboard");
      }
    } catch {
      // fall through to local password auth
    }
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

  const platformId = (user.app_metadata as { hr_platform_user_id?: string } | undefined)
    ?.hr_platform_user_id;
  const portalUrl = process.env.HR_PORTAL_SUPABASE_URL?.replace(/\/$/, "");
  const portalService = process.env.HR_PORTAL_SERVICE_ROLE_KEY;
  if (platformId && portalUrl && portalService) {
    const portalAdmin = createSb(portalUrl, portalService, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const upd = await portalAdmin.auth.admin.updateUserById(platformId, { password });
    if (upd.error) {
      redirect(`/update-password?error=${encodeURIComponent(upd.error.message)}`);
    }
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
