import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { documentRowTone } from "@/lib/company-documents";
import { resolveTaskReportScope } from "@/lib/dashboard-scope";
import type { OdooTaskUiRow } from "@/lib/integrations/odoo-task-ui-types";
import {
  classifyComplianceText,
  isComplianceRelatedText,
  type ComplianceCategory,
} from "@/lib/command-center/compliance-classifier";
import { loadOdooConnectionState } from "@/lib/ai-agent/load-user-integrations";
import {
  loadCompanyOdooSettings,
  resolveEffectiveOdooBaseUrl,
} from "@/lib/integrations/company-odoo-settings";

export type OperationalHealth = "critical" | "watch" | "stable";

export type AttentionItem = {
  id: string;
  kind: "odoo_task" | "compliance_doc" | "calendar_event" | "project";
  severity: "critical" | "high" | "medium";
  title: string;
  subtitle?: string;
  dueLabel?: string;
  daysOffset?: number;
};

export type OperationalInsight = {
  id: string;
  category: "compliance" | "workload" | "deadline" | "risk" | "activity";
  severity: "critical" | "warning" | "info";
  titleKey: string;
  titleParams?: Record<string, string | number>;
  bodyKey?: string;
  bodyParams?: Record<string, string | number>;
};

export type ComplianceMonitorItem = {
  id: string;
  source: "company_document" | "odoo_task" | "odoo_project";
  category: ComplianceCategory;
  name: string;
  tenantOrProject?: string;
  expiryOrDeadline?: string;
  daysRemaining?: number;
  tone: "ok" | "warning" | "overdue";
  status?: string;
};

export type WorkloadOwner = {
  name: string;
  taskCount: number;
  overdueCount: number;
  highPriorityCount: number;
};

export type OdooOperationalBrief = {
  connected: boolean;
  baseUrl: string;
  loginUsername: string | null;
  lastSyncAt: string | null;
  health: OperationalHealth;
  attentionToday: number;
  attentionCritical: number;
  attentionQueue: AttentionItem[];
  insights: OperationalInsight[];
  complianceItems: ComplianceMonitorItem[];
  workload: WorkloadOwner[];
  counts: {
    overdueTasks: number;
    dueTodayTasks: number;
    due7Days: number;
    due30Days: number;
    due90Days: number;
    unassignedTasks: number;
    stalledProjects: number;
    complianceExpiring90: number;
    complianceOverdue: number;
    complianceWarning: number;
    eventsToday: number;
    highPriorityTasks: number;
    openTasks: number;
    activeProjects: number;
  };
  topExposedTenant: string | null;
  syncStale: boolean;
};

type WorkspacePayload = {
  tasks?: unknown;
  projects?: unknown;
  events?: unknown;
  documents?: unknown;
};

type ProjectRow = {
  id: number;
  name: string;
  active: boolean;
  manager?: string;
};

type EventRow = {
  id: number;
  name: string;
  start: string;
  stop?: string;
};

function utcToday(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

function utcTodayStr(): string {
  return utcToday().toISOString().slice(0, 10);
}

function isTaskRow(v: unknown): v is OdooTaskUiRow {
  return Boolean(v && typeof v === "object" && "id" in v && "name" in v);
}

function parseTasks(raw: unknown): OdooTaskUiRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isTaskRow);
}

function parseProjects(raw: unknown): ProjectRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((p) => p && typeof p === "object" && "id" in p && "name" in p) as ProjectRow[];
}

function parseEvents(raw: unknown): EventRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((e) => e && typeof e === "object" && "id" in e && "start" in e) as EventRow[];
}

function daysUntil(dateStr: string | null | undefined, today: Date): number | null {
  if (!dateStr) return null;
  const d = Date.parse(String(dateStr).slice(0, 10));
  if (!Number.isFinite(d)) return null;
  const t = today.getTime();
  const target = new Date(d);
  target.setUTCHours(0, 0, 0, 0);
  return Math.round((target.getTime() - t) / 86400000);
}

function isHighPriority(task: OdooTaskUiRow): boolean {
  const p = String(task.priority ?? "").trim();
  return p === "1" || p === "2" || p.toLowerCase() === "high" || p === "3" || p.includes("عاجل") || p.includes("حرج");
}

function isUnassigned(task: OdooTaskUiRow): boolean {
  const r = String(task.responsible ?? "").trim();
  const hasAssignees = Array.isArray(task.assignees) && task.assignees.length > 0;
  return (!r || r === "—") && !hasAssignees;
}

function ownerKey(task: OdooTaskUiRow): string {
  if (task.responsible && task.responsible !== "—") return task.responsible;
  if (task.assignees?.[0]?.name) return task.assignees[0].name;
  return "—";
}

async function loadWorkspace(
  supabase: SupabaseClient,
  userId: string
): Promise<{ tasks: OdooTaskUiRow[]; projects: ProjectRow[]; events: EventRow[]; lastSyncAt: string | null }> {
  const { data: rows } = await supabase
    .from("odoo_browser_cache")
    .select("kind, payload, updated_at")
    .eq("user_id", userId);

  let tasks: OdooTaskUiRow[] = [];
  let projects: ProjectRow[] = [];
  let events: EventRow[] = [];
  let lastSyncAt: string | null = null;

  const cacheRows = rows ?? [];
  const syncTimes = cacheRows
    .map((r) => Date.parse(String(r.updated_at ?? "")))
    .filter((n) => Number.isFinite(n));
  if (syncTimes.length) lastSyncAt = new Date(Math.max(...syncTimes)).toISOString();

  const workspace = cacheRows.find((r) => r.kind === "workspace");
  if (workspace?.payload && typeof workspace.payload === "object") {
    const p = workspace.payload as WorkspacePayload;
    tasks = parseTasks(p.tasks);
    projects = parseProjects(p.projects);
    events = parseEvents(p.events);
  } else {
    const tasksRow = cacheRows.find((r) => r.kind === "tasks");
    if (tasksRow?.payload && typeof tasksRow.payload === "object") {
      tasks = parseTasks((tasksRow.payload as { tasks?: unknown }).tasks);
    }
    const projectsRow = cacheRows.find((r) => r.kind === "projects");
    if (projectsRow?.payload && typeof projectsRow.payload === "object") {
      projects = parseProjects((projectsRow.payload as { projects?: unknown }).projects);
    }
    const eventsRow = cacheRows.find((r) => r.kind === "events");
    if (eventsRow?.payload && typeof eventsRow.payload === "object") {
      events = parseEvents((eventsRow.payload as { events?: unknown }).events);
    }
  }

  return { tasks, projects, events, lastSyncAt };
}

export async function loadOdooOperationalBrief(
  supabase: SupabaseClient,
  userId: string,
  isSuperAdmin: boolean
): Promise<OdooOperationalBrief> {
  const today = utcToday();
  const todayStr = utcTodayStr();

  const [{ baseUrl }, company, credRow, workspace, scope] = await Promise.all([
    loadOdooConnectionState(supabase, userId),
    loadCompanyOdooSettings(supabase),
    supabase.from("user_odoo_credentials").select("login_username").eq("user_id", userId).maybeSingle(),
    loadWorkspace(supabase, userId),
    resolveTaskReportScope(supabase, userId, isSuperAdmin),
  ]);

  const effectiveUrl = baseUrl || (await resolveEffectiveOdooBaseUrl(supabase, userId));
  const connected = Boolean(credRow.data?.login_username && effectiveUrl);
  const { tasks, projects, events, lastSyncAt } = workspace;

  const syncStale = lastSyncAt
    ? Date.now() - Date.parse(lastSyncAt) > 24 * 60 * 60 * 1000
    : true;

  const complianceDocs: ComplianceMonitorItem[] = [];
  const tenantUrgent = new Map<string, number>();

  if (!(scope.mode === "tenants" && !scope.tenantIds.length)) {
    let docQ = supabase
      .from("company_documents")
      .select("id, document_name, expiry_date, alert_days_before, status, tenants ( name )");
    if (scope.mode === "tenants") docQ = docQ.in("tenant_id", scope.tenantIds);
    const { data: docs } = await docQ;

    for (const row of docs ?? []) {
      const exp = String(row.expiry_date);
      const alert = Number(row.alert_days_before);
      const tone = documentRowTone(exp, alert, todayStr);
      const days = daysUntil(exp, today) ?? 0;
      const t = row.tenants as { name?: string } | { name?: string }[] | null;
      const tenantName = Array.isArray(t)
        ? String(t[0]?.name ?? "—")
        : t && typeof t === "object" && "name" in t
          ? String(t.name)
          : "—";

      if (tone === "warning" || tone === "overdue") {
        tenantUrgent.set(tenantName, (tenantUrgent.get(tenantName) ?? 0) + 1);
      }

      complianceDocs.push({
        id: `doc-${row.id}`,
        source: "company_document",
        category: classifyComplianceText(String(row.document_name)),
        name: String(row.document_name),
        tenantOrProject: tenantName,
        expiryOrDeadline: exp,
        daysRemaining: days,
        tone,
        status: String(row.status),
      });
    }
  }

  complianceDocs.sort((a, b) => (a.daysRemaining ?? 999) - (b.daysRemaining ?? 999));

  let overdueTasks = 0;
  let dueTodayTasks = 0;
  let due7Days = 0;
  let due30Days = 0;
  let due90Days = 0;
  let unassignedTasks = 0;
  let highPriorityTasks = 0;
  const attentionQueue: AttentionItem[] = [];

  for (const task of tasks) {
    const days = daysUntil(task.deadline, today);
    if (days !== null && days < 0) overdueTasks++;
    if (days === 0) dueTodayTasks++;
    if (days !== null && days >= 0 && days <= 7) due7Days++;
    if (days !== null && days >= 0 && days <= 30) due30Days++;
    if (days !== null && days >= 0 && days <= 90) due90Days++;
    if (isUnassigned(task)) unassignedTasks++;
    if (isHighPriority(task)) highPriorityTasks++;

    if (days !== null && days <= 0) {
      attentionQueue.push({
        id: `task-${task.id}`,
        kind: "odoo_task",
        severity: days < 0 ? "critical" : "high",
        title: task.name,
        subtitle: task.project || undefined,
        dueLabel: task.deadline ?? undefined,
        daysOffset: days,
      });
    } else if (isHighPriority(task) && days !== null && days <= 7) {
      attentionQueue.push({
        id: `task-hp-${task.id}`,
        kind: "odoo_task",
        severity: "high",
        title: task.name,
        subtitle: task.project || undefined,
        dueLabel: task.deadline ?? undefined,
        daysOffset: days,
      });
    }

    if (isComplianceRelatedText(`${task.name} ${task.project ?? ""} ${task.tags?.join(" ") ?? ""}`)) {
      const daysRem = daysUntil(task.deadline, today);
      complianceDocs.push({
        id: `odoo-task-${task.id}`,
        source: "odoo_task",
        category: classifyComplianceText(task.name),
        name: task.name,
        tenantOrProject: task.project || undefined,
        expiryOrDeadline: task.deadline ?? undefined,
        daysRemaining: daysRem ?? undefined,
        tone: daysRem !== null && daysRem < 0 ? "overdue" : daysRem !== null && daysRem <= 30 ? "warning" : "ok",
        status: task.stage,
      });
    }
  }

  for (const p of projects) {
    if (!p.active) continue;
    if (isComplianceRelatedText(p.name)) {
      complianceDocs.push({
        id: `odoo-project-${p.id}`,
        source: "odoo_project",
        category: classifyComplianceText(p.name),
        name: p.name,
        tenantOrProject: p.manager,
        tone: "ok",
      });
    }
  }

  const projectTaskCounts = new Map<number, number>();
  for (const t of tasks) {
    if (t.projectId) projectTaskCounts.set(t.projectId, (projectTaskCounts.get(t.projectId) ?? 0) + 1);
  }
  const stalledProjects = projects.filter((p) => p.active && (projectTaskCounts.get(p.id) ?? 0) === 0).length;

  let eventsToday = 0;
  const todayY = today.getUTCFullYear();
  const todayM = today.getUTCMonth();
  const todayD = today.getUTCDate();
  for (const ev of events) {
    const start = Date.parse(String(ev.start).replace(" ", "T"));
    if (!Number.isFinite(start)) continue;
    const d = new Date(start);
    if (d.getUTCFullYear() === todayY && d.getUTCMonth() === todayM && d.getUTCDate() === todayD) {
      eventsToday++;
      attentionQueue.push({
        id: `event-${ev.id}`,
        kind: "calendar_event",
        severity: "medium",
        title: ev.name,
        dueLabel: ev.start,
        daysOffset: 0,
      });
    }
  }

  for (const doc of complianceDocs.filter((d) => d.source === "company_document" && d.tone !== "ok").slice(0, 20)) {
    attentionQueue.push({
      id: doc.id,
      kind: "compliance_doc",
      severity: doc.tone === "overdue" ? "critical" : "high",
      title: doc.name,
      subtitle: doc.tenantOrProject,
      dueLabel: doc.expiryOrDeadline,
      daysOffset: doc.daysRemaining,
    });
  }

  attentionQueue.sort((a, b) => {
    const rank = (s: AttentionItem["severity"]) => (s === "critical" ? 0 : s === "high" ? 1 : 2);
    const d = rank(a.severity) - rank(b.severity);
    if (d !== 0) return d;
    return (a.daysOffset ?? 99) - (b.daysOffset ?? 99);
  });

  const workloadMap = new Map<string, WorkloadOwner>();
  for (const task of tasks) {
    const name = ownerKey(task);
    if (name === "—") continue;
    const cur = workloadMap.get(name) ?? { name, taskCount: 0, overdueCount: 0, highPriorityCount: 0 };
    cur.taskCount++;
    const days = daysUntil(task.deadline, today);
    if (days !== null && days < 0) cur.overdueCount++;
    if (isHighPriority(task)) cur.highPriorityCount++;
    workloadMap.set(name, cur);
  }
  const workload = [...workloadMap.values()].sort((a, b) => b.taskCount - a.taskCount).slice(0, 8);

  const complianceOverdue = complianceDocs.filter((d) => d.tone === "overdue").length;
  const complianceWarning = complianceDocs.filter((d) => d.tone === "warning").length;
  const complianceExpiring90 = complianceDocs.filter(
    (d) => d.daysRemaining !== undefined && d.daysRemaining >= 0 && d.daysRemaining <= 90
  ).length;

  const insights: OperationalInsight[] = [];

  if (complianceExpiring90 > 0) {
    insights.push({
      id: "compliance-90",
      category: "compliance",
      severity: complianceOverdue > 0 ? "critical" : "warning",
      titleKey: "commandCenter.odoo.insightCompliance90",
      titleParams: { count: complianceExpiring90 },
    });
  }

  const topTenant = [...tenantUrgent.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topTenant) {
    insights.push({
      id: "tenant-exposed",
      category: "compliance",
      severity: "warning",
      titleKey: "commandCenter.odoo.insightTenantExposed",
      titleParams: { tenant: topTenant[0], count: topTenant[1] },
    });
  }

  if (workload[0] && workload[0].taskCount >= 5) {
    insights.push({
      id: "workload-top",
      category: "workload",
      severity: workload[0].overdueCount > 0 ? "warning" : "info",
      titleKey: "commandCenter.odoo.insightWorkload",
      titleParams: {
        name: workload[0].name,
        count: workload[0].taskCount,
        overdue: workload[0].overdueCount,
      },
    });
  }

  if (stalledProjects > 0) {
    insights.push({
      id: "stalled-projects",
      category: "activity",
      severity: "warning",
      titleKey: "commandCenter.odoo.insightStalledProjects",
      titleParams: { count: stalledProjects },
    });
  }

  if (unassignedTasks > 0) {
    insights.push({
      id: "unassigned",
      category: "risk",
      severity: "warning",
      titleKey: "commandCenter.odoo.insightUnassigned",
      titleParams: { count: unassignedTasks },
    });
  }

  if (overdueTasks > 0) {
    insights.push({
      id: "overdue",
      category: "deadline",
      severity: "critical",
      titleKey: "commandCenter.odoo.insightOverdue",
      titleParams: { count: overdueTasks },
    });
  }

  if (due7Days > 0) {
    insights.push({
      id: "due-7",
      category: "deadline",
      severity: "info",
      titleKey: "commandCenter.odoo.insightDue7",
      titleParams: { count: due7Days },
    });
  }

  if (syncStale) {
    insights.push({
      id: "sync-stale",
      category: "risk",
      severity: "warning",
      titleKey: "commandCenter.odoo.insightSyncStale",
    });
  }

  const attentionCritical = attentionQueue.filter((a) => a.severity === "critical").length;
  const attentionToday = attentionQueue.filter((a) => (a.daysOffset ?? 99) <= 0).length;

  let health: OperationalHealth = "stable";
  if (overdueTasks > 0 || complianceOverdue > 0 || attentionCritical >= 3) health = "critical";
  else if (
    dueTodayTasks > 0 ||
    complianceWarning > 0 ||
    highPriorityTasks > 0 ||
    attentionToday > 0
  )
    health = "watch";

  return {
    connected,
    baseUrl: company.baseUrl || effectiveUrl,
    loginUsername: credRow.data?.login_username ? String(credRow.data.login_username) : null,
    lastSyncAt,
    health,
    attentionToday,
    attentionCritical,
    attentionQueue: attentionQueue.slice(0, 12),
    insights: insights.slice(0, 8),
    complianceItems: complianceDocs.slice(0, 60),
    workload,
    counts: {
      overdueTasks,
      dueTodayTasks,
      due7Days,
      due30Days,
      due90Days,
      unassignedTasks,
      stalledProjects,
      complianceExpiring90,
      complianceOverdue,
      complianceWarning,
      eventsToday,
      highPriorityTasks,
      openTasks: tasks.length,
      activeProjects: projects.filter((p) => p.active).length,
    },
    topExposedTenant: topTenant?.[0] ?? null,
    syncStale,
  };
}
