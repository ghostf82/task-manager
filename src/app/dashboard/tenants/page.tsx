import { TenantsAdminClient } from "@/app/dashboard/tenants/tenants-admin-client";
import { requireSuperAdmin } from "@/lib/dashboard-auth";
import { getTranslator } from "@/lib/i18n/get-translator";
import { createClient } from "@/lib/supabase/server";

export default async function TenantsPage() {
  const { t } = await getTranslator();
  await requireSuperAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenants")
    .select("id,name,slug,is_active,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <p className="text-destructive text-sm">
        {t("tenantsPage.loadError")}: {error.message}
      </p>
    );
  }

  return <TenantsAdminClient tenants={data ?? []} />;
}
