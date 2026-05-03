import { requireSuperAdmin } from "@/lib/dashboard-auth";
import { createClient } from "@/lib/supabase/server";
import { TenantsAdminClient } from "@/app/dashboard/tenants/tenants-admin-client";

export default async function TenantsPage() {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenants")
    .select("id,name,slug,is_active,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <p className="text-destructive text-sm">
        تعذر تحميل الشركات: {error.message}
      </p>
    );
  }

  return <TenantsAdminClient tenants={data ?? []} />;
}
