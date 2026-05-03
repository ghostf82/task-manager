import { requireSession } from "@/lib/dashboard-auth";
import { createClient } from "@/lib/supabase/server";
import { TasksPageClient } from "@/app/dashboard/tasks/tasks-page-client";

export default async function TasksPage() {
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
        تعذر تحميل المهام: {tErr.message}
      </p>
    );
  }

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
    />
  );
}
