import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { documentRowTone } from "@/lib/company-documents";
import type { TaskReportScope } from "@/lib/dashboard-scope";
import type { TaskStatus } from "@/lib/corporate-tasks";

export type ExecutiveSummary = {
  documentsStable: number;
  documentsUrgent: number;
  tasksOpen: number;
  aiProposalsPending: number;
};

/** `labelKey` maps to `executiveDashboard.pie.*` in locale files. */
export type TaskStatusPieSlice = {
  labelKey: string;
  value: number;
  fill: string;
};

export type DocumentsExpiringByTenant = {
  name: string;
  count: number;
};

function utcTodayStr(): string {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

export async function loadExecutiveSummary(
  supabase: SupabaseClient,
  scope: TaskReportScope,
  userId: string
): Promise<ExecutiveSummary> {
  const today = utcTodayStr();
  const noTenantScope = scope.mode === "tenants" && !scope.tenantIds.length;

  let documentsStable = 0;
  let documentsUrgent = 0;
  if (!noTenantScope) {
    let docQuery = supabase
      .from("company_documents")
      .select("expiry_date, alert_days_before, tenants ( name )");
    if (scope.mode === "tenants") {
      docQuery = docQuery.in("tenant_id", scope.tenantIds);
    }
    const { data: docs } = await docQuery;
    for (const row of docs ?? []) {
      const exp = String(row.expiry_date);
      const alert = Number(row.alert_days_before);
      const tone = documentRowTone(exp, alert, today);
      if (tone === "ok") documentsStable++;
      else documentsUrgent++;
    }
  }

  let openCount = 0;
  if (!noTenantScope) {
    let taskQ = supabase
      .from("corporate_tasks")
      .select("id", { count: "exact", head: true })
      .in("status", ["not_started", "in_progress", "on_hold"]);
    if (scope.mode === "tenants") {
      taskQ = taskQ.in("tenant_id", scope.tenantIds);
    }
    const { count } = await taskQ;
    openCount = count ?? 0;
  }

  const { count: pendingAi } = await supabase
    .from("ai_agent_proposals")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "pending");

  return {
    documentsStable,
    documentsUrgent,
    tasksOpen: openCount,
    aiProposalsPending: pendingAi ?? 0,
  };
}

/** Pie: مكتملة، قيد التنفيذ، متأخرة — حسب نطاق RLS */
export async function loadTaskStatusPie(
  supabase: SupabaseClient,
  scope: TaskReportScope
): Promise<TaskStatusPieSlice[]> {
  const empty: TaskStatusPieSlice[] = [
    { labelKey: "executiveDashboard.pie.completed", value: 0, fill: "#22c55e" },
    { labelKey: "executiveDashboard.pie.inProgress", value: 0, fill: "#3b82f6" },
    { labelKey: "executiveDashboard.pie.overdue", value: 0, fill: "#ef4444" },
  ];

  if (scope.mode === "tenants" && !scope.tenantIds.length) {
    return empty;
  }

  let q = supabase.from("corporate_tasks").select("status,due_on");

  if (scope.mode === "tenants") {
    q = q.in("tenant_id", scope.tenantIds);
  }

  const { data: tasks, error } = await q;
  if (error || !tasks?.length) {
    return empty;
  }

  const today = utcTodayStr();
  let completed = 0;
  let overdue = 0;
  let inProgress = 0;

  for (const t of tasks) {
    const st = t.status as TaskStatus;
    if (st === "cancelled") continue;
    if (st === "completed") {
      completed++;
      continue;
    }
    const due = String(t.due_on);
    if (due < today) overdue++;
    else inProgress++;
  }

  return [
    { labelKey: "executiveDashboard.pie.completed", value: completed, fill: "#22c55e" },
    { labelKey: "executiveDashboard.pie.inProgress", value: inProgress, fill: "#3b82f6" },
    { labelKey: "executiveDashboard.pie.overdue", value: overdue, fill: "#ef4444" },
  ];
}

/** مستندات منتهية أو داخل نافذة التنبيه — تجميع حسب الشركة */
export async function loadDocumentsUrgentByTenant(
  supabase: SupabaseClient,
  scope: TaskReportScope
): Promise<DocumentsExpiringByTenant[]> {
  let q = supabase
    .from("company_documents")
    .select("expiry_date, alert_days_before, tenants ( name )");

  if (scope.mode === "tenants") {
    if (!scope.tenantIds.length) return [];
    q = q.in("tenant_id", scope.tenantIds);
  }

  const { data: rows } = await q;
  const today = utcTodayStr();
  const byName = new Map<string, number>();

  for (const row of rows ?? []) {
    const exp = String(row.expiry_date);
    const alert = Number(row.alert_days_before);
    const tone = documentRowTone(exp, alert, today);
    if (tone !== "warning" && tone !== "overdue") continue;
    const t = row.tenants as { name?: string } | { name?: string }[] | null;
    const name = Array.isArray(t)
      ? String(t[0]?.name ?? "—")
      : t && typeof t === "object" && "name" in t
        ? String(t.name)
        : "—";
    byName.set(name, (byName.get(name) ?? 0) + 1);
  }

  return [...byName.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
}
