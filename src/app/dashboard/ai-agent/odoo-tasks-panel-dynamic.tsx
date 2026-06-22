"use client";

import dynamic from "next/dynamic";

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
} | null;

export function OdooTasksPanelDynamic({
  initialWorkspace,
  initialLastSyncAt,
  odooBaseUrl = null,
  onlySection = null,
}: {
  initialWorkspace: InitialWorkspace;
  initialLastSyncAt: string | null;
  odooBaseUrl?: string | null;
  onlySection?: "tasks" | "projects" | "calendar" | "documents" | null;
}) {
  return (
    <OdooTasksPanel
      initialWorkspace={initialWorkspace}
      initialLastSyncAt={initialLastSyncAt}
      odooBaseUrl={odooBaseUrl}
      onlySection={onlySection}
    />
  );
}
