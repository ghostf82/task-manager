"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangleIcon,
  CalendarIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ClipboardListIcon,
  FileStackIcon,
  FolderKanbanIcon,
  RefreshCwIcon,
} from "lucide-react";
import { toast } from "sonner";

import { listOdooWorkspaceAllAction } from "@/app/dashboard/ai-agent/actions";
import { OdooTasksPanelDynamic } from "@/app/dashboard/ai-agent/odoo-tasks-panel-dynamic";
import { CommandQuickLink } from "@/components/command-center/command-center-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { OdooBriefLabels } from "@/lib/command-center/odoo-brief-labels";
import type { AttentionItem, OdooOperationalBrief } from "@/lib/command-center/odoo-operational-brief";
import type { OdooWorkspacePayload } from "@/lib/command-center/load-odoo-workspace-cache";

type WorkspaceTab = "tasks" | "projects" | "calendar" | "documents" | "reports";

const TAB_SECTION: Record<Exclude<WorkspaceTab, "reports">, "tasks" | "projects" | "calendar" | "documents"> = {
  tasks: "tasks",
  projects: "projects",
  calendar: "calendar",
  documents: "documents",
};

function formatDt(iso: string | null, locale: string) {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleString(locale === "en" ? "en-GB" : "ar-SA", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function severityClass(severity: AttentionItem["severity"]) {
  if (severity === "critical") return "border-rose-500/30 bg-rose-500/5";
  if (severity === "high") return "border-amber-500/30 bg-amber-500/5";
  return "border-border/60 bg-muted/20";
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
  const initialTab: WorkspaceTab =
    tabParam === "tasks" ||
    tabParam === "projects" ||
    tabParam === "calendar" ||
    tabParam === "documents" ||
    tabParam === "reports"
      ? tabParam
      : "tasks";

  const [tab, setTab] = useState<WorkspaceTab>(initialTab);
  const [focusOpen, setFocusOpen] = useState(true);
  const [syncing, startSync] = useTransition();

  const setTabAndUrl = useCallback(
    (next: WorkspaceTab) => {
      setTab(next);
      const url = next === "tasks" ? "/dashboard/odoo" : `/dashboard/odoo?tab=${next}`;
      router.replace(url, { scroll: false });
    },
    [router]
  );

  const onlySection = tab in TAB_SECTION ? TAB_SECTION[tab as keyof typeof TAB_SECTION] : null;

  const tabs = useMemo(
    () =>
      [
        { id: "tasks" as const, label: labels.tabTasks, icon: ClipboardListIcon },
        { id: "projects" as const, label: labels.tabProjects, icon: FolderKanbanIcon },
        { id: "calendar" as const, label: labels.tabCalendar, icon: CalendarIcon },
        { id: "documents" as const, label: labels.tabDocuments, icon: FileStackIcon },
        { id: "reports" as const, label: labels.tabReports, icon: FileStackIcon },
      ] as const,
    [labels]
  );

  const c = brief.counts;
  const focusItems = brief.attentionQueue.slice(0, 5);
  const complianceAttention = c.complianceOverdue + c.complianceWarning;

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

  return (
    <div className="mx-auto max-w-[1400px] space-y-3 pb-14">
      {/* Layer 0 — minimal chrome */}
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

      {/* Layer 1 — executive strip (~20% intelligence) */}
      <div className="flex flex-wrap items-stretch gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
        <StripMetric label={labels.summaryOverdue} value={c.overdueTasks} tone="rose" />
        <StripMetric label={labels.summaryDueSoon} value={c.due7Days} tone="amber" />
        <StripMetric label={labels.summaryHighPriority} value={c.highPriorityTasks} tone="violet" />
        <StripMetric label={labels.summaryCompliance} value={complianceAttention} tone="amber" />
        <div className="flex min-w-[140px] flex-1 items-center gap-2 rounded-lg bg-background/80 px-2.5 py-1.5">
          {brief.syncStale ? (
            <AlertTriangleIcon className="size-3.5 shrink-0 text-amber-600" />
          ) : (
            <CheckCircle2Icon className="size-3.5 shrink-0 text-emerald-600" />
          )}
          <div className="min-w-0">
            <p className="text-muted-foreground text-[10px]">{labels.summaryLastSync}</p>
            <p className="truncate text-xs font-medium">{formatDt(brief.lastSyncAt, locale)}</p>
          </div>
        </div>
      </div>

      {/* Layer 2 — smart focus (compact, guides into workspace) */}
      {focusItems.length ? (
        <div className="rounded-xl border border-border/60 bg-background">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start"
            onClick={() => setFocusOpen((o) => !o)}
          >
            <span className="text-sm font-medium">{labels.priorityFeedTitle}</span>
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
              {focusItems.length}
              <ChevronDownIcon className={cn("size-4 transition-transform", !focusOpen && "-rotate-90")} />
            </span>
          </button>
          {focusOpen ? (
            <div className="grid gap-1.5 border-t border-border/50 px-3 pb-3 pt-2 sm:grid-cols-2 lg:grid-cols-3">
              {focusItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    "rounded-lg border p-2 text-start text-xs transition hover:ring-1 hover:ring-primary/20",
                    severityClass(item.severity)
                  )}
                  onClick={() => {
                    if (item.kind === "calendar_event") setTabAndUrl("calendar");
                    else if (item.kind === "compliance_doc") setTabAndUrl("documents");
                    else setTabAndUrl("tasks");
                  }}
                >
                  <div className="flex items-start justify-between gap-1">
                    <p className="line-clamp-2 font-medium">{item.title}</p>
                    <Badge variant="outline" className="shrink-0 text-[9px]">
                      {item.severity}
                    </Badge>
                  </div>
                  {item.dueLabel ? (
                    <p className="text-muted-foreground mt-0.5 text-[10px]">
                      {item.daysOffset !== undefined && item.daysOffset < 0
                        ? labels.overdueLabel
                        : labels.daysRemaining}
                      : {item.dueLabel}
                    </p>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Layer 3 — primary workspace (~80%) */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1 border-b border-border/60 pb-1">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTabAndUrl(t.id)}
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

        {tab === "reports" ? (
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{labels.reportsTitle}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {[
                { href: "/api/reports/odoo-operational", label: labels.reportOperationalPdf },
                { href: "/api/reports/documents", label: labels.reportComplianceExcel },
                { href: "/api/reports/tasks?format=pdf", label: labels.reportTasksPdf },
                { href: "/api/reports/tasks", label: labels.reportTasksExcel },
              ].map((r) => (
                <a
                  key={r.href}
                  href={r.href}
                  className={cn(
                    buttonVariants({ variant: "outline" }),
                    "h-auto min-h-10 justify-start whitespace-normal py-2.5 text-start"
                  )}
                >
                  {r.label}
                </a>
              ))}
            </CardContent>
          </Card>
        ) : (
          <OdooTasksPanelDynamic
            key={`${tab}-${initialLastSyncAt ?? "none"}`}
            initialWorkspace={initialWorkspace}
            initialLastSyncAt={initialLastSyncAt}
            odooBaseUrl={odooBaseUrl}
            onlySection={onlySection}
            embedded
            collapseFutureCalendar
            workspaceMode
          />
        )}
      </div>
    </div>
  );
}

function StripMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "rose" | "amber" | "violet";
}) {
  const ring = { rose: "text-rose-700", amber: "text-amber-800", violet: "text-violet-800" };
  return (
    <div className="flex min-w-[88px] flex-col rounded-lg bg-background/80 px-2.5 py-1.5">
      <p className="text-muted-foreground text-[10px]">{label}</p>
      <p className={cn("text-lg font-bold tabular-nums leading-tight", ring[tone])}>{value}</p>
    </div>
  );
}
