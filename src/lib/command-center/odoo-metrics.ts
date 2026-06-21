import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { OdooTaskUiRow } from "@/lib/integrations/odoo-task-ui-types";
import {
  loadCompanyOdooSettings,
  resolveEffectiveOdooBaseUrl,
} from "@/lib/integrations/company-odoo-settings";
import { loadOdooConnectionState } from "@/lib/ai-agent/load-user-integrations";

export type OdooCommandMetrics = {
  connected: boolean;
  connectionMode: "browser_session" | "api" | "none";
  baseUrl: string;
  loginUsername: string | null;
  lastSyncAt: string | null;
  openTasks: number;
  overdueTasks: number;
  highPriorityTasks: number;
  projects: number;
  calendarEvents: number;
  documents: number;
  tasksDueToday: number;
};

type WorkspacePayload = {
  tasks?: unknown;
  projects?: unknown;
  events?: unknown;
  documents?: unknown;
};

function isTaskRow(v: unknown): v is OdooTaskUiRow {
  return Boolean(v && typeof v === "object" && "id" in v && "name" in v);
}

function parseTasks(raw: unknown): OdooTaskUiRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isTaskRow);
}

function countOverdue(tasks: OdooTaskUiRow[]): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return tasks.filter((t) => {
    if (!t.deadline) return false;
    const d = Date.parse(t.deadline);
    if (!Number.isFinite(d)) return false;
    return d < today.getTime();
  }).length;
}

function countDueToday(tasks: OdooTaskUiRow[]): number {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  return tasks.filter((t) => {
    if (!t.deadline) return false;
    const dt = new Date(t.deadline);
    return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d;
  }).length;
}

function countHighPriority(tasks: OdooTaskUiRow[]): number {
  return tasks.filter((t) => {
    const p = String(t.priority ?? "").trim();
    return p === "1" || p === "2" || p.toLowerCase() === "high" || p === "3";
  }).length;
}

export async function loadOdooCommandMetrics(
  supabase: SupabaseClient,
  userId: string
): Promise<OdooCommandMetrics> {
  const [{ mode, baseUrl }, company, credRow, cacheRes] = await Promise.all([
    loadOdooConnectionState(supabase, userId),
    loadCompanyOdooSettings(supabase),
    supabase
      .from("user_odoo_credentials")
      .select("login_username")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("odoo_browser_cache")
      .select("kind, payload, updated_at")
      .eq("user_id", userId),
  ]);

  const effectiveUrl = baseUrl || (await resolveEffectiveOdooBaseUrl(supabase, userId));
  const connected = Boolean(credRow.data?.login_username && effectiveUrl);

  let tasks: OdooTaskUiRow[] = [];
  let projects = 0;
  let calendarEvents = 0;
  let documents = 0;
  let lastSyncAt: string | null = null;

  const rows = cacheRes.data ?? [];
  const syncTimes = rows
    .map((r) => Date.parse(String(r.updated_at ?? "")))
    .filter((n) => Number.isFinite(n));
  if (syncTimes.length) {
    lastSyncAt = new Date(Math.max(...syncTimes)).toISOString();
  }

  const workspace = rows.find((r) => r.kind === "workspace");
  if (workspace?.payload && typeof workspace.payload === "object") {
    const p = workspace.payload as WorkspacePayload;
    tasks = parseTasks(p.tasks);
    projects = Array.isArray(p.projects) ? p.projects.length : 0;
    calendarEvents = Array.isArray(p.events) ? p.events.length : 0;
    documents = Array.isArray(p.documents) ? p.documents.length : 0;
  } else {
    const tasksRow = rows.find((r) => r.kind === "tasks");
    if (tasksRow?.payload && typeof tasksRow.payload === "object") {
      const p = tasksRow.payload as { tasks?: unknown };
      tasks = parseTasks(p.tasks);
    }
    const projectsRow = rows.find((r) => r.kind === "projects");
    if (projectsRow?.payload && typeof projectsRow.payload === "object") {
      const p = projectsRow.payload as { projects?: unknown };
      projects = Array.isArray(p.projects) ? p.projects.length : 0;
    }
    const eventsRow = rows.find((r) => r.kind === "events");
    if (eventsRow?.payload && typeof eventsRow.payload === "object") {
      const p = eventsRow.payload as { events?: unknown };
      calendarEvents = Array.isArray(p.events) ? p.events.length : 0;
    }
    const docsRow = rows.find((r) => r.kind === "documents");
    if (docsRow?.payload && typeof docsRow.payload === "object") {
      const p = docsRow.payload as { documents?: unknown };
      documents = Array.isArray(p.documents) ? p.documents.length : 0;
    }
  }

  return {
    connected,
    connectionMode: mode,
    baseUrl: company.baseUrl || effectiveUrl,
    loginUsername: credRow.data?.login_username ? String(credRow.data.login_username) : null,
    lastSyncAt,
    openTasks: tasks.length,
    overdueTasks: countOverdue(tasks),
    highPriorityTasks: countHighPriority(tasks),
    projects,
    calendarEvents,
    documents,
    tasksDueToday: countDueToday(tasks),
  };
}
