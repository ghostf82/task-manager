"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/dashboard-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function getRolesForTenantAction(tenantId: string) {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("roles")
    .select("slug,name")
    .eq("tenant_id", tenantId)
    .order("slug");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type InviteMembershipInput = {
  tenant_id: string;
  role_slug: string;
  job_title: string;
};

export async function inviteUserAction(input: {
  email: string;
  full_name: string;
  phone?: string;
  national_id?: string;
  memberships: InviteMembershipInput[];
}) {
  await requireSuperAdmin();
  const email = input.email.trim().toLowerCase();
  if (!email || !input.full_name.trim()) throw new Error("البريد والاسم مطلوبان");
  if (!input.memberships.length) throw new Error("اختر شركة واحدة على الأقل مع الدور");

  const admin = createAdminClient();
  const supabase = await createClient();

  const { data: existingList } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  const existing = existingList?.users?.find(
    (u) => u.email?.toLowerCase() === email
  );

  let userId: string;
  if (existing) {
    userId = existing.id;
    const { error: upd } = await admin.auth.admin.updateUserById(userId, {
      email_confirm: true,
    });
    if (upd) throw new Error(upd.message);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: "123456",
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    if (!data.user) throw new Error("فشل إنشاء المستخدم");
    userId = data.user.id;
  }

  const { error: profErr } = await admin
    .from("users")
    .update({
      email,
      full_name: input.full_name.trim(),
      phone: input.phone?.trim() || null,
      national_id: input.national_id?.trim() || null,
      must_change_password: true,
      is_super_admin: false,
    })
    .eq("id", userId);
  if (profErr) throw new Error(profErr.message);

  for (const m of input.memberships) {
    const { data: roleRow, error: roleErr } = await supabase
      .from("roles")
      .select("id")
      .eq("tenant_id", m.tenant_id)
      .eq("slug", m.role_slug)
      .maybeSingle();
    if (roleErr || !roleRow) throw new Error("تعذر تحديد الدور للشركة المختارة");

    await admin
      .from("tenant_memberships")
      .delete()
      .eq("tenant_id", m.tenant_id)
      .eq("user_id", userId);

    const { error: memErr } = await admin.from("tenant_memberships").insert({
      tenant_id: m.tenant_id,
      user_id: userId,
      role_id: roleRow.id,
      status: "active",
      job_title: m.job_title.trim() || null,
    });
    if (memErr) throw new Error(memErr.message);
  }

  revalidatePath("/dashboard/users");
  revalidatePath("/dashboard");
}

export async function bulkUsersMembershipAction(
  userIds: string[],
  op: "suspend" | "activate"
) {
  await requireSuperAdmin();
  if (!userIds.length) return;
  const admin = createAdminClient();
  const status = op === "suspend" ? "suspended" : "active";
  const { error } = await admin
    .from("tenant_memberships")
    .update({ status })
    .in("user_id", userIds);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/users");
}

export async function deleteUsersAction(userIds: string[]) {
  await requireSuperAdmin();
  if (!userIds.length) return;
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("users")
    .select("id,is_super_admin")
    .in("id", userIds);
  const safeIds = (rows ?? [])
    .filter((r) => !r.is_super_admin)
    .map((r) => r.id);
  if (!safeIds.length) {
    throw new Error("لا يمكن حذف حسابات السوبر أدمن");
  }
  for (const id of safeIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/dashboard/users");
}
