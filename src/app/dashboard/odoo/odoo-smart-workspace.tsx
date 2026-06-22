"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BarChart3Icon,
  CalendarIcon,
  ClipboardListIcon,
  FileStackIcon,
  FolderKanbanIcon,
  LayoutDashboardIcon,
  RefreshCwIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react";
import { toast } from "sonner";

import { listOdooWorkspaceAllAction } from "@/app/dashboard/ai-agent/actions";
import { OdooTasksPanelDynamic } from "@/app/dashboard/ai-agent/odoo-tasks-panel-dynamic";
import { OdooInteractiveDashboard } from "@/app/dashboard/odoo/odoo-interactive-dashboard";
import { OdooReportsPanel } from "@/app/dashboard/odoo/odoo-reports-panel";
import type { OdooFolderRow } from "@/app/dashboard/odoo/odoo-documents-explorer";
import { CommandQuickLink } from "@/components/command-center/command-center-shell";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OdooBriefLabels } from "@/lib/command-center/odoo-brief-labels";
import type { OdooOperationalBrief } from "@/lib/command-center/odoo-operational-brief";
import type { OdooWorkspacePayload } from "@/lib/command-center/load-odoo-workspace-cache";
import {
  parseOdooWorkspaceFilter,
  type OdooWorkspaceFilter,
} from "@/lib/command-center/odoo-workspace-filters";
import { isOdooSoundEnabled, setOdooSoundEnabled } from "@/lib/odoo-alerts/notification-sound";

type WorkspaceTab = "dashboard" | "tasks" | "projects" | "calendar" | "documents" | "reports";

const TAB_SECTION: Record<
  Exclude<WorkspaceTab, "dashboard" | "reports">,
  "tasks" | "projects" | "calendar" | "documents"
> = {
  tasks: "tasks",
  projects: "projects",
  calendar: "calendar",
  documents: "documents",
};

function parseTab(raw: string | null): WorkspaceTab {
  if (
    raw === "dashboard" ||
    raw === "tasks" ||
    raw === "projects" ||
    raw === "calendar" ||
    raw === "documents" ||
    raw === "reports"
  ) {
    return raw;
  }
  return "dashboard";
}

export function OdooSmartWorkspace({
  brief,
  labels,
  locale,
  initialWorkspace,
  initialLastSyncAt,
  odooBaseUrl,
}: {
  brief: OdooOperationalBrief;
  labels: OdooBriefLabels;
  locale: string;
  initialWorkspace: OdooWorkspacePayload | null;
  initialLastSyncAt: string | null;
  odooBaseUrl: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const filterParam = parseOdooWorkspaceFilter(searchParams.get("filter"));

  const [tab, setTab] = useState<WorkspaceTab>(() => parseTab(tabParam));
  const [workspaceFilter, setWorkspaceFilter] = useState<OdooWorkspaceFilter>(filterParam);
  const [soundOn, setSoundOn] = useState(() =>
    typeof window !== "undefined" ? isOdooSoundEnabled() : true
  );
  const [syncing, startSync] = useTransition();

  const initialFolders = useMemo((): OdooFolderRow[] | undefined => {
    const raw = initialWorkspace?.folders;
    if (!Array.isArray(raw)) return undefined;
    return raw as OdooFolderRow[];
  }, [initialWorkspace]);

  const setTabFilterAndUrl = useCallback(
    (nextTab: WorkspaceTab, filter?: OdooWorkspaceFilter) => {
      setTab(nextTab);
      setWorkspaceFilter(filter ?? null);
      const params = new URLSearchParams();
      if (nextTab !== "dashboard") params.set("tab", nextTab);
      if (filter) params.set("filter", filter);
      const qs = params.toString();
      router.replace(qs ? `/dashboard/odoo?${qs}` : "/dashboard/odoo", { scroll: false });
    },
    [router]
  );

  const onlySection = tab in TAB_SECTION ? TAB_SECTION[tab as keyof typeof TAB_SECTION] : null;

  const tabs = useMemo(
    () =>
      [
        { id: "dashboard" as const, label: labels.tabOverview, icon: LayoutDashboardIcon },
        { id: "tasks" as const, label: labels.tabTasks, icon: ClipboardListIcon },
        { id: "projects" as const, label: labels.tabProjects, icon: FolderKanbanIcon },
        { id: "calendar" as const, label: labels.tabCalendar, icon: CalendarIcon },
        { id: "documents" as const, label: labels.tabDocuments, icon: FileStackIcon },
        { id: "reports" as const, label: labels.tabReports, icon: BarChart3Icon },
      ] as const,
    [labels]
  );

  function runSync() {
    startSync(async () => {
      const toastId = toast.loading(labels.syncWorkspace);
      const res = await listOdooWorkspaceAllAction({});
      toast.dismiss(toastId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(labels.live);
      router.refresh();
    });
  }

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    setOdooSoundEnabled(next);
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-3 pb-14">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-xl font-bold tracking-tight sm:text-2xl">{labels.workspaceTitle}</h1>
          <p className="text-muted-foreground text-xs sm:text-sm">{labels.workspaceSubtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={cn(buttonVariants({ variant: "default", size: "sm" }), "gap-1.5")}
            disabled={syncing}
            onClick={() => runSync()}
          >
            <RefreshCwIcon className={cn("size-3.5", syncing && "animate-spin")} />
            {labels.syncWorkspace}
          </button>
          <button
            type="button"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
            onClick={toggleSound}
            title={locale === "en" ? "Alert sounds" : "أصوات التنبيه"}
          >
            {soundOn ? <Volume2Icon className="size-3.5" /> : <VolumeXIcon className="size-3.5" />}
          </button>
          {brief.baseUrl ? (
            <a
              href={brief.baseUrl}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              {labels.openOdoo}
            </a>
          ) : null}
          <CommandQuickLink href="/dashboard/settings/integrations" label={labels.settings} />
        </div>
      </div>

      {workspaceFilter && tab !== "dashboard" ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
          <span className="font-medium text-primary">
            {locale === "en" ? "Active filter:" : "تصفية نشطة:"} {workspaceFilter}
          </span>
          <button
            type="button"
            className="text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setTabFilterAndUrl(tab, null)}
          >
            {locale === "en" ? "Clear" : "مسح"}
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1 border-b border-border/60 pb-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTabFilterAndUrl(t.id, t.id === tab ? workspaceFilter : null)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition",
                tab === t.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              <Icon className="size-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "dashboard" ? (
        <OdooInteractiveDashboard
          brief={brief}
          labels={labels}
          locale={locale}
          onSync={runSync}
          syncing={syncing}
          onNavigate={(nextTab, filter) => {
            const mapped = nextTab === "reports" ? "reports" : (nextTab as WorkspaceTab);
            setTabFilterAndUrl(mapped === "dashboard" ? "tasks" : mapped, filter ?? null);
          }}
        />
      ) : tab === "reports" ? (
        <OdooReportsPanel labels={labels} locale={locale} />
      ) : (
        <OdooTasksPanelDynamic
          key={`${tab}-${workspaceFilter ?? "all"}-${initialLastSyncAt ?? "none"}`}
          initialWorkspace={initialWorkspace}
          initialLastSyncAt={initialLastSyncAt}
          odooBaseUrl={odooBaseUrl}
          onlySection={onlySection}
          embedded
          collapseFutureCalendar
          workspaceMode
          workspaceFilter={workspaceFilter}
          initialFolders={initialFolders}
          openFutureArchive={workspaceFilter === "future_archive"}
        />
      )}
    </div>
  );
}
