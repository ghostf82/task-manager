"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangleIcon,
  CalendarIcon,
  CheckCircle2Icon,
  ClipboardListIcon,
  FileStackIcon,
  FolderKanbanIcon,
  LayoutGridIcon,
  RefreshCwIcon,
} from "lucide-react";

import { OdooTasksPanelDynamic } from "@/app/dashboard/ai-agent/odoo-tasks-panel-dynamic";
import { CommandQuickLink } from "@/components/command-center/command-center-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { OdooBriefLabels } from "@/lib/command-center/odoo-brief-labels";
import { formatInsightText } from "@/lib/command-center/odoo-brief-labels";
import type { AttentionItem, OdooOperationalBrief } from "@/lib/command-center/odoo-operational-brief";
import type { OdooWorkspacePayload } from "@/lib/command-center/load-odoo-workspace-cache";

type WorkspaceTab = "overview" | "tasks" | "projects" | "calendar" | "documents" | "reports";

const TAB_SECTION: Record<Exclude<WorkspaceTab, "overview" | "reports">, "tasks" | "projects" | "calendar" | "documents"> = {
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
      : "overview";

  const [tab, setTab] = useState<WorkspaceTab>(initialTab);

  const setTabAndUrl = useCallback(
    (next: WorkspaceTab) => {
      setTab(next);
      const url = next === "overview" ? "/dashboard/odoo" : `/dashboard/odoo?tab=${next}`;
      router.replace(url, { scroll: false });
    },
    [router]
  );

  const onlySection = tab in TAB_SECTION ? TAB_SECTION[tab as keyof typeof TAB_SECTION] : null;

  const tabs = useMemo(
    () =>
      [
        { id: "overview" as const, label: labels.tabOverview, icon: LayoutGridIcon },
        { id: "tasks" as const, label: labels.tabTasks, icon: ClipboardListIcon },
        { id: "projects" as const, label: labels.tabProjects, icon: FolderKanbanIcon },
        { id: "calendar" as const, label: labels.tabCalendar, icon: CalendarIcon },
        { id: "documents" as const, label: labels.tabDocuments, icon: FileStackIcon },
        { id: "reports" as const, label: labels.tabReports, icon: FileStackIcon },
      ] as const,
    [labels]
  );

  const c = brief.counts;
  const dueSoon = c.due7Days;
  const needsAttention = brief.attentionToday + brief.attentionCritical;

  return (
    <div className="mx-auto max-w-[1320px] space-y-6 pb-14">
      <header className="relative overflow-hidden rounded-2xl border border-gold/15 bg-linear-to-br from-primary/6 via-white/95 to-sky-500/5 p-5 ring-1 ring-gold/10 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-primary/80 text-xs font-semibold tracking-[0.18em] uppercase">{labels.eyebrow}</p>
            <h1 className="font-heading mt-1 text-2xl font-bold tracking-tight">{labels.workspaceTitle}</h1>
            <p className="text-muted-foreground mt-1 max-w-xl text-sm">{labels.workspaceSubtitle}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={cn(buttonVariants({ variant: "default", size: "sm" }), "gap-1.5")}
              onClick={() => setTabAndUrl("tasks")}
            >
              <RefreshCwIcon className="size-3.5" />
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

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <SummaryChip label={labels.summaryAttention} value={needsAttention} tone="rose" />
          <SummaryChip label={labels.summaryDueSoon} value={dueSoon} tone="amber" />
          <SummaryChip label={labels.summaryOverdue} value={c.overdueTasks} tone="rose" />
          <SummaryChip label={labels.summaryHighPriority} value={c.highPriorityTasks} tone="violet" />
          <SummaryChip label={labels.summaryUnassigned} value={c.unassignedTasks} tone="sky" />
          <div className="rounded-xl border border-border/60 bg-white/80 px-3 py-2.5">
            <p className="text-muted-foreground text-[10px] font-medium uppercase">{labels.summaryLastSync}</p>
            <p className="mt-0.5 text-xs font-semibold">{formatDt(brief.lastSyncAt, locale)}</p>
            {brief.syncStale ? (
              <p className="text-amber-700 mt-0.5 flex items-center gap-1 text-[10px]">
                <AlertTriangleIcon className="size-3" />
                {labels.syncStaleHint}
              </p>
            ) : (
              <p className="text-emerald-700 mt-0.5 flex items-center gap-1 text-[10px]">
                <CheckCircle2Icon className="size-3" />
                {labels.live}
              </p>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-wrap gap-1.5 border-b border-border/60 pb-1">
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

      {tab === "overview" ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{labels.priorityFeedTitle}</CardTitle>
              <CardDescription>{labels.priorityFeedDesc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {!brief.attentionQueue.length ? (
                <p className="text-muted-foreground py-8 text-center text-sm">{labels.priorityFeedEmpty}</p>
              ) : (
                brief.attentionQueue.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      "w-full rounded-xl border p-3 text-start text-sm transition hover:ring-1 hover:ring-primary/20",
                      severityClass(item.severity)
                    )}
                    onClick={() => {
                      if (item.kind === "calendar_event") setTabAndUrl("calendar");
                      else if (item.kind === "compliance_doc") setTabAndUrl("documents");
                      else setTabAndUrl("tasks");
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">{item.title}</p>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {item.severity}
                      </Badge>
                    </div>
                    {item.subtitle ? (
                      <p className="text-muted-foreground mt-0.5 text-xs">{item.subtitle}</p>
                    ) : null}
                    {item.dueLabel ? (
                      <p className="text-muted-foreground mt-1 text-[11px]">
                        {item.daysOffset !== undefined && item.daysOffset < 0
                          ? labels.overdueLabel
                          : labels.daysRemaining}
                        : {item.dueLabel}
                      </p>
                    ) : null}
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          <aside className="space-y-3">
            {brief.insights.slice(0, 5).map((ins) => {
              const { title } = formatInsightText(labels, ins.titleKey, ins.titleParams, ins.bodyKey, ins.bodyParams);
              return (
                <div
                  key={ins.id}
                  className="rounded-xl border border-violet-500/15 bg-violet-500/5 p-3 text-xs leading-relaxed"
                >
                  {title}
                </div>
              );
            })}
          </aside>
        </div>
      ) : null}

      {tab === "reports" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{labels.reportsTitle}</CardTitle>
            <CardDescription>{labels.reportsDesc}</CardDescription>
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
      ) : null}

      {tab !== "overview" && tab !== "reports" ? (
        <OdooTasksPanelDynamic
          initialWorkspace={initialWorkspace}
          initialLastSyncAt={initialLastSyncAt}
          odooBaseUrl={odooBaseUrl}
          onlySection={onlySection}
          embedded
          collapseFutureCalendar
        />
      ) : null}
    </div>
  );
}

function SummaryChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "rose" | "amber" | "violet" | "sky";
}) {
  const ring = {
    rose: "ring-rose-500/20",
    amber: "ring-amber-500/20",
    violet: "ring-violet-500/20",
    sky: "ring-sky-500/20",
  };
  return (
    <div className={cn("rounded-xl border border-border/60 bg-white/80 px-3 py-2.5 ring-1", ring[tone])}>
      <p className="text-muted-foreground text-[10px] font-medium">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
