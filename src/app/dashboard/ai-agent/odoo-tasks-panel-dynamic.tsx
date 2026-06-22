"use client";

import dynamic from "next/dynamic";

import type { OdooFolderRow } from "@/app/dashboard/odoo/odoo-documents-explorer";
import type { OdooWorkspaceFilter } from "@/lib/command-center/odoo-workspace-filters";

const OdooTasksPanel = dynamic(
  () => import("./odoo-tasks-panel").then((m) => ({ default: m.OdooTasksPanel })),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-md border border-border/60 p-6 text-sm text-muted-foreground">
        جاري تحميل لوحة Odoo…
      </div>
    ),
  },
);

type InitialWorkspace = {
  tasks: unknown;
  projects: unknown;
  events: unknown;
  documents: unknown;
  folders?: unknown;
} | null;

export function OdooTasksPanelDynamic({
  initialWorkspace,
  initialLastSyncAt,
  odooBaseUrl = null,
  onlySection = null,
  embedded = false,
  collapseFutureCalendar = false,
  workspaceMode = false,
  workspaceFilter = null,
  initialFolders,
  openFutureArchive = false,
}: {
  initialWorkspace: InitialWorkspace;
  initialLastSyncAt: string | null;
  odooBaseUrl?: string | null;
  onlySection?: "tasks" | "projects" | "calendar" | "documents" | null;
  embedded?: boolean;
  collapseFutureCalendar?: boolean;
  workspaceMode?: boolean;
  workspaceFilter?: OdooWorkspaceFilter;
  initialFolders?: OdooFolderRow[];
  openFutureArchive?: boolean;
}) {
  return (
    <OdooTasksPanel
      initialWorkspace={initialWorkspace}
      initialLastSyncAt={initialLastSyncAt}
      odooBaseUrl={odooBaseUrl}
      onlySection={onlySection}
      embedded={embedded}
      collapseFutureCalendar={collapseFutureCalendar}
      workspaceMode={workspaceMode}
      workspaceFilter={workspaceFilter}
      initialFolders={initialFolders}
      openFutureArchive={openFutureArchive}
    />
  );
}
