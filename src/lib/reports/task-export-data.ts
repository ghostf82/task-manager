import type { SupabaseClient } from "@supabase/supabase-js";
import type { TaskReportScope } from "@/lib/dashboard-scope";
import {
  daysRemaining,
  monthsRemaining,
  statusLabelsAr,
  taskRowTone,
  type TaskStatus,
} from "@/lib/corporate-tasks";

export type TaskExportTone = ReturnType<typeof taskRowTone>;

export type TaskExportRow = {
  display_number: number;
  tenant_name: string;
  title: string;
  assignee: string;
  issued_on: string;
  due_on: string;
  follow_up_on: string;
  followed_today: string;
  status_ar: string;
  completion_percent: string;
  days_remaining: number;
  months_remaining: number;
  notes: string;
  tone: TaskExportTone;
};

export async function loadTaskExportRows(
  supabase: SupabaseClient,
  scope: TaskReportScope,
  tenantFilter?: string | null
): Promise<TaskExportRow[]> {
  let q = supabase
    .from("corporate_tasks")
    .select(
      "id,tenant_id,display_number,title,assignee_id,issued_on,due_on,follow_up_on,followed_up_on,status,completion_percent,notes"
    );

  if (scope.mode === "tenants") {
    if (!scope.tenantIds.length) return [];
    q = q.in("tenant_id", scope.tenantIds);
  }
  if (tenantFilter) q = q.eq("tenant_id", tenantFilter);

  const { data: tasks, error } = await q.order("tenant_id").order("display_number");
  if (error || !tasks?.length) return [];

  const tenantIds = [...new Set(tasks.map((t) => t.tenant_id as string))];
  const userIds = [
    ...new Set(
      tasks.flatMap((t) => [t.assignee_id].filter(Boolean) as string[])
    ),
  ];

  const [{ data: tenants }, { data: users }] = await Promise.all([
    supabase.from("tenants").select("id,name").in("id", tenantIds),
    userIds.length
      ? supabase.from("users").select("id,full_name,email").in("id", userIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string }[] }),
  ]);

  const tmap = Object.fromEntries((tenants ?? []).map((x) => [x.id, x.name]));
  const umap = Object.fromEntries(
    (users ?? []).map((u) => [u.id, u.full_name?.trim() || u.email])
  );

  const todayStr = new Date().toISOString().slice(0, 10);

  return tasks.map((t) => {
    const st = t.status as TaskStatus;
    const tone = taskRowTone({
      status: st,
      dueOn: String(t.due_on),
      followedUpOn: t.followed_up_on ? String(t.followed_up_on) : null,
    });
    return {
      display_number: Number(t.display_number),
      tenant_name: tmap[t.tenant_id as string] ?? "—",
      title: String(t.title),
      assignee: t.assignee_id ? umap[t.assignee_id as string] ?? "—" : "—",
      issued_on: String(t.issued_on),
      due_on: String(t.due_on),
      follow_up_on: t.follow_up_on ? String(t.follow_up_on) : "—",
      followed_today: t.followed_up_on === todayStr ? "نعم" : "لا",
      status_ar: statusLabelsAr[st],
      completion_percent: String(Number(t.completion_percent).toFixed(0)),
      days_remaining: daysRemaining(String(t.due_on)),
      months_remaining: monthsRemaining(String(t.due_on)),
      notes: t.notes ? String(t.notes) : "",
      tone,
    };
  });
}
