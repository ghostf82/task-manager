import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

// Prefer .env.local over inherited shell env (e.g. stale NEXT_PUBLIC_SUPABASE_URL).
loadEnv({ path: resolve(process.cwd(), ".env.local"), override: true });

/** First super-admin (Auth + public.users.is_super_admin). */
const email = "fucurl@gmail.com";
const password = "123456";

function assertEnv(url: string | undefined, serviceKey: string | undefined) {
  if (!url?.trim() || !serviceKey?.trim()) {
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local (see .env.example)."
    );
  }
  if (/placeholder|paste_your|your-service-role|example\.supabase/i.test(serviceKey)) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY looks like a placeholder. Paste the real service_role secret from Supabase → Settings → API."
    );
  }
  if (/your-project|example\.supabase/i.test(url)) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must be your real project URL (e.g. https://xxxx.supabase.co)."
    );
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  assertEnv(url, serviceKey);

  const admin = createClient(url!, serviceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: page, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listErr) throw listErr;

  const existing = page.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );

  if (existing) {
    const { error: updAuth } = await admin.auth.admin.updateUserById(
      existing.id,
      { password, email_confirm: true }
    );
    if (updAuth) throw updAuth;

    const { error: profErr } = await admin
      .from("users")
      .update({
        email,
        must_change_password: true,
        is_super_admin: true,
        full_name: "Super Admin",
      })
      .eq("id", existing.id);
    if (profErr) throw profErr;

    console.log("Updated existing super admin:", email);
    return;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Super Admin" },
  });
  if (error) throw error;
  if (!data.user) throw new Error("createUser returned no user");

  const { error: profErr } = await admin
    .from("users")
    .update({
      email,
      must_change_password: true,
      is_super_admin: true,
      full_name: "Super Admin",
    })
    .eq("id", data.user.id);
  if (profErr) throw profErr;

  console.log("Created super admin:", email);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
