"use client";

import { Suspense } from "react";

import { OdooSmartWorkspace } from "@/app/dashboard/odoo/odoo-smart-workspace";
import type { OdooBriefLabels } from "@/lib/command-center/odoo-brief-labels";
import type { OdooOperationalBrief } from "@/lib/command-center/odoo-operational-brief";
import type { OdooWorkspacePayload } from "@/lib/command-center/load-odoo-workspace-cache";

export function OdooSmartWorkspaceShell({
  brief,
  labels,
  locale,
  initialWorkspace,
  initialLastSyncAt,
  odooBaseUrl,
  loadingLabel,
}: {
  brief: OdooOperationalBrief;
  labels: OdooBriefLabels;
  locale: string;
  initialWorkspace: OdooWorkspacePayload | null;
  initialLastSyncAt: string | null;
  odooBaseUrl: string | null;
  loadingLabel: string;
}) {
  return (
    <Suspense
      fallback={
        <div className="text-muted-foreground py-16 text-center text-sm">{loadingLabel}</div>
      }
    >
      <OdooSmartWorkspace
        brief={brief}
        labels={labels}
        locale={locale}
        initialWorkspace={initialWorkspace}
        initialLastSyncAt={initialLastSyncAt}
        odooBaseUrl={odooBaseUrl}
      />
    </Suspense>
  );
}
