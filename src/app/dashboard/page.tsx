import { ExecutiveDashboard } from "@/app/dashboard/executive-dashboard";
import { requireSession } from "@/lib/dashboard-auth";
import { resolveTaskReportScope } from "@/lib/dashboard-scope";
import {
  loadDocumentsUrgentByTenant,
  loadExecutiveSummary,
  loadTaskStatusPie,
} from "@/lib/executive-stats";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardHomePage() {
  const session = await requireSession();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("users")
    .select("is_super_admin")
    .eq("id", session.id)
    .single();

  const scope = await resolveTaskReportScope(
    supabase,
    session.id,
    Boolean(profile?.is_super_admin)
  );

  const [summary, taskPie, docBar] = await Promise.all([
    loadExecutiveSummary(supabase, scope, session.id),
    loadTaskStatusPie(supabase, scope),
    loadDocumentsUrgentByTenant(supabase, scope),
  ]);

  const { data: latestScan } = await supabase
    .from("ai_agent_activity_log")
    .select("created_at,message")
    .eq("user_id", session.id)
    .eq("event_type", "scan")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let tenantCount = 0;
  let userCount = 0;
  let unreadNotif = 0;

  if (session.isSuperAdmin) {
    const [{ count: tc }, { count: uc }, { count: nc }] = await Promise.all([
      supabase.from("tenants").select("*", { count: "exact", head: true }),
      supabase.from("users").select("*", { count: "exact", head: true }),
      supabase.from("notifications").select("*", { count: "exact", head: true }).is("read_at", null),
    ]);
    tenantCount = tc ?? 0;
    userCount = uc ?? 0;
    unreadNotif = nc ?? 0;
  } else {
    const { count: nc } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .is("read_at", null);
    unreadNotif = nc ?? 0;
  }

  return (
    <ExecutiveDashboard
      summary={summary}
      taskPie={taskPie}
      docBar={docBar}
      isSuperAdmin={session.isSuperAdmin}
      tenantCount={tenantCount}
      userCount={userCount}
      unreadNotif={unreadNotif}
      lastScanAt={latestScan?.created_at ?? null}
      lastScanMessage={latestScan?.message ?? null}
    />
  );
}
