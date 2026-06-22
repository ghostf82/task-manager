import type { OdooTaskUiRow } from "@/lib/integrations/odoo-task-ui-types";

export type ProjectIntel = {
  taskCount: number;
  openTasks: number;
  overdueTasks: number;
  highPriorityTasks: number;
  unassignedTasks: number;
  hasNoOwner: boolean;
  hasNoTasks: boolean;
  isStalled: boolean;
  risk: "none" | "watch" | "critical";
};

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

export function buildProjectIntelMap(
  tasks: OdooTaskUiRow[],
  projects: Array<{ id: number; manager: string }>
): Map<number, ProjectIntel> {
  const map = new Map<number, ProjectIntel>();
  const now = Date.now();
  const dayMs = 86400000;

  for (const p of projects) {
    const mgr = String(p.manager || "").trim();
    map.set(p.id, {
      taskCount: 0,
      openTasks: 0,
      overdueTasks: 0,
      highPriorityTasks: 0,
      unassignedTasks: 0,
      hasNoOwner: !mgr || mgr === "—",
      hasNoTasks: true,
      isStalled: false,
      risk: "none",
    });
  }

  for (const t of tasks) {
    if (!t.projectId || !t.active) continue;
    const intel = map.get(t.projectId);
    if (!intel) continue;
    intel.hasNoTasks = false;
    intel.taskCount += 1;
    intel.openTasks += 1;
    if (isHighPriority(t.priority)) intel.highPriorityTasks += 1;
    if (isUnassigned(t)) intel.unassignedTasks += 1;
    const dueMs = parseDeadlineMs(t.deadline);
    if (dueMs != null && dueMs < now) intel.overdueTasks += 1;
    if (dueMs != null && dueMs < now - 14 * dayMs) intel.isStalled = true;
  }

  for (const [, intel] of map) {
    if (intel.hasNoOwner) intel.risk = intel.risk === "critical" ? "critical" : "watch";
    if (intel.overdueTasks > 0 || intel.highPriorityTasks >= 3) intel.risk = "critical";
    else if (intel.unassignedTasks > 0 || intel.hasNoTasks || intel.isStalled || intel.hasNoOwner)
      intel.risk = "watch";
  }

  return map;
}

export type CalendarRange = "today" | "week" | "30d" | "all";

export function eventInCalendarRange(start: string, range: CalendarRange, now = new Date()): boolean {
  if (range === "all") return true;
  const startMs = Date.parse(String(start).replace(" ", "T"));
  if (!Number.isFinite(startMs)) return false;

  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  if (range === "today") {
    return startMs >= startOfDay.getTime() && startMs < endOfDay.getTime();
  }

  if (range === "week") {
    const endWeek = new Date(startOfDay);
    endWeek.setDate(endWeek.getDate() + 7);
    return startMs >= startOfDay.getTime() && startMs < endWeek.getTime();
  }

  const end30 = new Date(startOfDay);
  end30.setDate(end30.getDate() + 30);
  return startMs >= startOfDay.getTime() && startMs < end30.getTime();
}
