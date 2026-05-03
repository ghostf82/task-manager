import type { SupabaseClient } from "@supabase/supabase-js";

export type TaskReportScope =
  | { mode: "all" }
  | { mode: "tenants"; tenantIds: string[] };

/** Super admin → all tenants; managers/admins → their managed tenants only; else → all member tenants. */
export async function resolveTaskReportScope(
  supabase: SupabaseClient,
  userId: string,
  isSuperAdmin: boolean
): Promise<TaskReportScope> {
  if (isSuperAdmin) return { mode: "all" };

  const { data: rows } = await supabase
    .from("tenant_memberships")
    .select("tenant_id, roles ( slug )")
    .eq("user_id", userId)
    .eq("status", "active");

  const managerTenants = new Set<string>();
  const allTenants = new Set<string>();

  for (const row of rows ?? []) {
    const tid = row.tenant_id as string;
    allTenants.add(tid);
    const r = row.roles as { slug?: string } | { slug?: string }[] | null;
    const slug = Array.isArray(r) ? r[0]?.slug : r?.slug;
    if (slug === "manager" || slug === "tenant_admin") {
      managerTenants.add(tid);
    }
  }

  if (managerTenants.size > 0) {
    return { mode: "tenants", tenantIds: [...managerTenants] };
  }
  return { mode: "tenants", tenantIds: [...allTenants] };
}
