import type { OdooTaskUiRow } from "@/lib/integrations/odoo-task-ui-types";

/** Actionable dashboard filters — map KPI clicks to record lists. */
export type OdooWorkspaceFilter =
  | "overdue"
  | "due_soon"
  | "due_today"
  | "high_priority"
  | "unassigned"
  | "compliance"
  | "projects_no_tasks"
  | "stalled_projects"
  | "future_archive"
  | null;

export type OdooFilterTargetTab = "tasks" | "projects" | "calendar" | "documents";

export type OdooFilterMeta = {
  id: OdooWorkspaceFilter;
  tab: OdooFilterTargetTab;
  param: string;
};

export const ODOO_FILTER_CATALOG: Record<Exclude<OdooWorkspaceFilter, null>, OdooFilterMeta> = {
  overdue: { id: "overdue", tab: "tasks", param: "overdue" },
  due_soon: { id: "due_soon", tab: "tasks", param: "due_soon" },
  due_today: { id: "due_today", tab: "tasks", param: "due_today" },
  high_priority: { id: "high_priority", tab: "tasks", param: "high_priority" },
  unassigned: { id: "unassigned", tab: "tasks", param: "unassigned" },
  compliance: { id: "compliance", tab: "documents", param: "compliance" },
  projects_no_tasks: { id: "projects_no_tasks", tab: "projects", param: "no_tasks" },
  stalled_projects: { id: "stalled_projects", tab: "projects", param: "stalled" },
  future_archive: { id: "future_archive", tab: "calendar", param: "future_archive" },
};

export function parseOdooWorkspaceFilter(raw: string | null | undefined): OdooWorkspaceFilter {
  if (!raw) return null;
  const key = raw.trim() as OdooWorkspaceFilter;
  if (key && key in ODOO_FILTER_CATALOG) return key;
  return null;
}

function parseDeadlineMs(deadline: string): number | null {
  const raw = String(deadline || "").trim();
  if (!raw || raw === "—") return null;
  const ms = Date.parse(raw.replace(" ", "T"));
  return Number.isFinite(ms) ? ms : null;
}

function isHighPriority(priority: string): boolean {
  const p = String(priority || "").toLowerCase();
  return p === "1" || p === "2" || p.includes("high") || p.includes("عالي");
}

function isUnassigned(task: OdooTaskUiRow): boolean {
  if (task.assigneeIds.length) return false;
  const r = String(task.responsible || "").trim();
  return !r || r === "—";
}


export function applyTaskWorkspaceFilter(
  tasks: OdooTaskUiRow[],
  filter: OdooWorkspaceFilter,
  now = Date.now()
): OdooTaskUiRow[] {
  if (!filter) return tasks;
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);
  const end7 = new Date(startOfDay);
  end7.setDate(end7.getDate() + 7);

  return tasks.filter((t) => {
    if (!t.active) return false;
    const dueMs = parseDeadlineMs(t.deadline);
    switch (filter) {
      case "overdue":
        return dueMs != null && dueMs < now;
      case "due_today":
        return dueMs != null && dueMs >= startOfDay.getTime() && dueMs < endOfDay.getTime();
      case "due_soon":
        return dueMs != null && dueMs >= startOfDay.getTime() && dueMs < end7.getTime();
      case "high_priority":
        return isHighPriority(t.priority);
      case "unassigned":
        return isUnassigned(t);
      default:
        return true;
    }
  });
}

export type ProjectFilterRow = {
  id: number;
  name: string;
  manager?: string;
  taskCount?: number;
  openTaskCount?: number;
  overdueTaskCount?: number;
  isStalled?: boolean;
  hasNoTasks?: boolean;
};

export function applyProjectWorkspaceFilter(
  projects: ProjectFilterRow[],
  filter: OdooWorkspaceFilter
): ProjectFilterRow[] {
  if (!filter) return projects;
  return projects.filter((p) => {
    switch (filter) {
      case "projects_no_tasks":
        return (p.taskCount ?? 0) === 0 || p.hasNoTasks;
      case "stalled_projects":
        return Boolean(p.isStalled || (p.overdueTaskCount ?? 0) > 0);
      case "unassigned":
        return !String(p.manager || "").trim() || p.manager === "—";
      default:
        return true;
    }
  });
}

export function buildOdooFilterHref(tab: OdooFilterTargetTab, filter: OdooWorkspaceFilter): string {
  const base = tab === "tasks" ? "/dashboard/odoo" : `/dashboard/odoo?tab=${tab}`;
  if (!filter) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}filter=${filter}`;
}
