import { requireSession } from "@/lib/dashboard-auth";
import { resolveEffectiveOdooBaseUrl } from "@/lib/integrations/company-odoo-settings";
import { createClient } from "@/lib/supabase/server";

import { OdooTasksPanelDynamic } from "@/app/dashboard/ai-agent/odoo-tasks-panel-dynamic";

type WorkspacePayload = {
  tasks: unknown;
  projects: unknown;
  events: unknown;
  documents: unknown;
};

function isWorkspacePayload(v: unknown): v is WorkspacePayload {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    Array.isArray(o.tasks) &&
    Array.isArray(o.projects) &&
    Array.isArray(o.events) &&
    Array.isArray(o.documents)
  );
}

export async function OdooTasksPanelWithCache({
  onlySection = null,
}: {
  onlySection?: "tasks" | "projects" | "calendar" | "documents" | null;
} = {}) {
  const session = await requireSession();
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("odoo_browser_cache")
    .select("kind,payload,updated_at")
    .eq("user_id", session.id);

  let initialWorkspace: WorkspacePayload | null = null;
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

  const odooBaseUrl = (await resolveEffectiveOdooBaseUrl(supabase, session.id)) || null;

  return (
    <OdooTasksPanelDynamic
      initialWorkspace={initialWorkspace}
      initialLastSyncAt={lastSyncAt}
      odooBaseUrl={odooBaseUrl}
      onlySection={onlySection}
    />
  );
}
