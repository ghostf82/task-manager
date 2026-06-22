import { loadOdooWorkspaceCache } from "@/lib/command-center/load-odoo-workspace-cache";
import { requireSession } from "@/lib/dashboard-auth";
import { createClient } from "@/lib/supabase/server";

import { OdooTasksPanelDynamic } from "@/app/dashboard/ai-agent/odoo-tasks-panel-dynamic";

export async function OdooTasksPanelWithCache({
  onlySection = null,
  embedded = false,
  collapseFutureCalendar = false,
}: {
  onlySection?: "tasks" | "projects" | "calendar" | "documents" | null;
  embedded?: boolean;
  collapseFutureCalendar?: boolean;
} = {}) {
  const session = await requireSession();
  const supabase = await createClient();
  const { initialWorkspace, lastSyncAt, odooBaseUrl } = await loadOdooWorkspaceCache(supabase, session.id);

  return (
    <OdooTasksPanelDynamic
      initialWorkspace={initialWorkspace}
      initialLastSyncAt={lastSyncAt}
      odooBaseUrl={odooBaseUrl}
      onlySection={onlySection}
      embedded={embedded}
      collapseFutureCalendar={collapseFutureCalendar}
    />
  );
}
