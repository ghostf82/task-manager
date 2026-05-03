import { TasksPageClient } from "@/app/dashboard/tasks/tasks-page-client";
import { requireSession } from "@/lib/dashboard-auth";
import { getTranslator } from "@/lib/i18n/get-translator";
import { createClient } from "@/lib/supabase/server";

export default async function TasksPage() {
  const { t } = await getTranslator();
  const session = await requireSession();
  const supabase = await createClient();

  const [{ data: tasks, error: tErr }, { data: tenants }, { data: users }] =
    await Promise.all([
      supabase
        .from("corporate_tasks")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase.from("tenants").select("id,name,is_active").order("name"),
      supabase.from("users").select("id,full_name,email").order("full_name"),
    ]);

  if (tErr) {
    return (
      <p className="text-destructive text-sm">
        {t("errors.tasks.loadFailed")}: {tErr.message}
      </p>
    );
  }

  const serverToday = new Date().toISOString().slice(0, 10);

  let defaultTenantId: string | null = null;
  if (!session.isSuperAdmin) {
    const { data: m } = await supabase
      .from("tenant_memberships")
      .select("tenant_id")
      .eq("user_id", session.id)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    defaultTenantId = m?.tenant_id ?? null;
  }

  return (
    <TasksPageClient
      tasks={tasks ?? []}
      tenants={tenants ?? []}
      users={users ?? []}
      isSuperAdmin={session.isSuperAdmin}
      defaultTenantId={defaultTenantId}
      serverToday={serverToday}
    />
  );
}
