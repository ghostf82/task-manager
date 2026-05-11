"use client";

import dynamic from "next/dynamic";

export const OdooTasksPanelDynamic = dynamic(
  () => import("./odoo-tasks-panel").then((m) => ({ default: m.OdooTasksPanel })),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-md border border-border/60 p-6 text-sm text-muted-foreground">
        جاري تحميل لوحة Odoo…
      </div>
    ),
  }
);
