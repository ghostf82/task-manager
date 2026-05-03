import type { SupabaseClient } from "@supabase/supabase-js";
import type { TaskReportScope } from "@/lib/dashboard-scope";
import type { TaskStatus } from "@/lib/corporate-tasks";

export type DashboardStats = {
  chart: { segment: "completed" | "overdue" | "waiting"; value: number; fill: string }[];
  topActive: { id: string; label: string; count: number }[];
  topLate: { id: string; label: string; count: number }[];
  totals: {
    completed: number;
    overdue: number;
    waiting: number;
    total: number;
  };
};

function utcTodayStr(): string {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

export async function loadDashboardStats(
  supabase: SupabaseClient,
  scope: TaskReportScope
): Promise<DashboardStats> {
  let q = supabase
    .from("corporate_tasks")
    .select("id,status,due_on,assignee_id,tenant_id");

  if (scope.mode === "tenants") {
    if (!scope.tenantIds.length) {
      return {
        chart: [],
        topActive: [],
        topLate: [],
        totals: { completed: 0, overdue: 0, waiting: 0, total: 0 },
      };
    }
    q = q.in("tenant_id", scope.tenantIds);
  }

  const { data: tasks, error } = await q;
  if (error || !tasks?.length) {
    return {
      chart: [],
      topActive: [],
      topLate: [],
      totals: { completed: 0, overdue: 0, waiting: 0, total: 0 },
    };
  }

  const nonCancelled = tasks.filter((t) => t.status !== "cancelled");
  const today = utcTodayStr();
  let completed = 0;
  let overdue = 0;
  let waiting = 0;

  const completedBy = new Map<string, number>();
  const lateBy = new Map<string, number>();

  for (const t of nonCancelled) {
    const st = t.status as TaskStatus;
    if (st === "cancelled") continue;

    const due = String(t.due_on);
    const done = st === "completed";
    const isOver = !done && due < today;

    if (st === "completed") {
      completed++;
      if (t.assignee_id) {
        completedBy.set(
          t.assignee_id,
          (completedBy.get(t.assignee_id) ?? 0) + 1
        );
      }
    } else if (isOver) {
      overdue++;
      if (t.assignee_id) {
        lateBy.set(t.assignee_id, (lateBy.get(t.assignee_id) ?? 0) + 1);
      }
    } else {
      waiting++;
    }
  }

  const chart = [
    { segment: "completed" as const, value: completed, fill: "#22c55e" },
    { segment: "overdue" as const, value: overdue, fill: "#ef4444" },
    { segment: "waiting" as const, value: waiting, fill: "#f59e0b" },
  ];

  const userIds = new Set<string>([
    ...completedBy.keys(),
    ...lateBy.keys(),
  ]);
  const { data: users } = await supabase
    .from("users")
    .select("id,full_name,email")
    .in("id", [...userIds]);

  const label = (id: string) => {
    const u = users?.find((x) => x.id === id);
    return u?.full_name?.trim() || u?.email || id.slice(0, 8);
  };

  const topActive = [...completedBy.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({ id, label: label(id), count }));

  const topLate = [...lateBy.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({ id, label: label(id), count }));

  return {
    chart,
    topActive,
    topLate,
    totals: {
      completed,
      overdue,
      waiting,
      total: nonCancelled.length,
    },
  };
}
