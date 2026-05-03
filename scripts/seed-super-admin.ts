import { createClient } from "@supabase/supabase-js";

const email = "fucurl@gmail.com";
const password = "123456";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. in .env.local)."
    );
  }

  const admin = createClient(url, serviceKey, {
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
