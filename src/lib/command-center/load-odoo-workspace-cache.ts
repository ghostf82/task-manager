import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveEffectiveOdooBaseUrl } from "@/lib/integrations/company-odoo-settings";

export type OdooWorkspacePayload = {
  tasks: unknown;
  projects: unknown;
  events: unknown;
  documents: unknown;
};

function isWorkspacePayload(v: unknown): v is OdooWorkspacePayload {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    Array.isArray(o.tasks) &&
    Array.isArray(o.projects) &&
    Array.isArray(o.events) &&
    Array.isArray(o.documents)
  );
}

export async function loadOdooWorkspaceCache(
  supabase: SupabaseClient,
  userId: string
): Promise<{
  initialWorkspace: OdooWorkspacePayload | null;
  lastSyncAt: string | null;
  odooBaseUrl: string | null;
}> {
  const { data: rows } = await supabase
    .from("odoo_browser_cache")
    .select("kind,payload,updated_at")
    .eq("user_id", userId);

  let initialWorkspace: OdooWorkspacePayload | null = null;
  const workspaceRow = rows?.find((r) => r.kind === "workspace");
  if (workspaceRow?.payload && isWorkspacePayload(workspaceRow.payload)) {
    initialWorkspace = workspaceRow.payload;
  } else {
    const tasksRow = rows?.find((r) => r.kind === "tasks");
    if (tasksRow?.payload && typeof tasksRow.payload === "object") {
      const p = tasksRow.payload as { tasks?: unknown };
      if (Array.isArray(p.tasks)) {
        initialWorkspace = { tasks: p.tasks, projects: [], events: [], documents: [] };
      }
    }
  }

  const times = (rows ?? [])
    .map((r) => Date.parse(String(r.updated_at)))
    .filter((n) => Number.isFinite(n));
  const lastSyncAt = times.length ? new Date(Math.max(...times)).toISOString() : null;
  const odooBaseUrl = (await resolveEffectiveOdooBaseUrl(supabase, userId)) || null;

  return { initialWorkspace, lastSyncAt, odooBaseUrl };
}
