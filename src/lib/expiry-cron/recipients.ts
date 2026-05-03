import type { SupabaseClient } from "@supabase/supabase-js";

/** Super admins + tenant managers / tenant admins for in-app + email alerts. */
export async function collectExpiryAlertRecipientIds(
  admin: SupabaseClient,
  tenantId: string
): Promise<string[]> {
  const ids = new Set<string>();

  const { data: supers } = await admin
    .from("users")
    .select("id")
    .eq("is_super_admin", true);
  for (const s of supers ?? []) {
    if (s.id) ids.add(s.id as string);
  }

  const { data: mem } = await admin
    .from("tenant_memberships")
    .select("user_id, roles ( slug )")
    .eq("tenant_id", tenantId)
    .eq("status", "active");

  for (const m of mem ?? []) {
    const r = m.roles as { slug?: string } | { slug?: string }[] | null;
    const slug = Array.isArray(r) ? r[0]?.slug : r?.slug;
    if (slug === "tenant_admin" || slug === "manager") {
      ids.add(m.user_id as string);
    }
  }

  return [...ids];
}
