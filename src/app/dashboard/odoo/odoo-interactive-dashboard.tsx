"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangleIcon,
  CalendarIcon,
  CheckCircle2Icon,
  ClipboardListIcon,
  FileStackIcon,
  FolderKanbanIcon,
  RefreshCwIcon,
  TrendingUpIcon,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { OdooBriefLabels } from "@/lib/command-center/odoo-brief-labels";
import type { AttentionItem, OdooOperationalBrief } from "@/lib/command-center/odoo-operational-brief";
import {
  buildOdooFilterHref,
  type OdooWorkspaceFilter,
} from "@/lib/command-center/odoo-workspace-filters";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type CoverageSnapshot = {
  tasks?: { fetched: number; total: number };
  projects?: { fetched: number; total: number };
  calendar?: { fetched: number; total: number; totalWindow?: number; futureArchiveTotal?: number };
  documents?: { fetched: number; total: number; foldersFetched?: number };
  folders?: { fetched: number; total: number };
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

type KpiDef = {
  id: OdooWorkspaceFilter | "sync" | "events_today" | "open_tasks";
  label: string;
  value: number;
  tone: "rose" | "amber" | "violet" | "sky" | "emerald" | "slate";
  tab?: "tasks" | "projects" | "calendar" | "documents";
  filter?: OdooWorkspaceFilter;
};

export function OdooInteractiveDashboard({
  brief,
  labels,
  locale,
  onNavigate,
  onSync,
  syncing,
}: {
  brief: OdooOperationalBrief;
  labels: OdooBriefLabels;
  locale: string;
  onNavigate: (tab: string, filter?: OdooWorkspaceFilter) => void;
  onSync: () => void;
  syncing: boolean;
}) {
  const [coverage, setCoverage] = useState<CoverageSnapshot | null>(null);
  const c = brief.counts;

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/odoo/coverage")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data?.ok) setCoverage(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [brief.lastSyncAt]);

  const kpis: KpiDef[] = useMemo(
    () => [
      { id: "overdue", label: labels.summaryOverdue, value: c.overdueTasks, tone: "rose", tab: "tasks", filter: "overdue" },
      { id: "due_soon", label: labels.summaryDueSoon, value: c.due7Days, tone: "amber", tab: "tasks", filter: "due_soon" },
      { id: "high_priority", label: labels.summaryHighPriority, value: c.highPriorityTasks, tone: "violet", tab: "tasks", filter: "high_priority" },
      { id: "unassigned", label: labels.summaryUnassigned, value: c.unassignedTasks, tone: "sky", tab: "tasks", filter: "unassigned" },
      {
        id: "compliance",
        label: labels.summaryCompliance,
        value: c.complianceOverdue + c.complianceWarning,
        tone: "amber",
        tab: "documents",
        filter: "compliance",
      },
      {
        id: "projects_no_tasks",
        label: labels.insightStalledProjects.replace(/\{count\}/, String(c.stalledProjects)),
        value: c.stalledProjects,
        tone: "slate",
        tab: "projects",
        filter: "stalled_projects",
      },
      { id: "events_today", label: labels.eventsToday, value: c.eventsToday, tone: "emerald", tab: "calendar" },
      { id: "open_tasks", label: labels.actionToday, value: c.openTasks, tone: "sky", tab: "tasks" },
    ],
    [c, labels]
  );

  const taskChart = useMemo(
    () => [
      { name: labels.summaryOverdue, value: c.overdueTasks, color: "#e11d48", filter: "overdue" as const },
      { name: labels.summaryDueSoon, value: c.due7Days, color: "#d97706", filter: "due_soon" as const },
      { name: labels.summaryHighPriority, value: c.highPriorityTasks, color: "#7c3aed", filter: "high_priority" as const },
      { name: labels.summaryUnassigned, value: c.unassignedTasks, color: "#0284c7", filter: "unassigned" as const },
    ].filter((d) => d.value > 0),
    [c, labels]
  );

  const workloadChart = useMemo(
    () =>
      brief.workload.slice(0, 6).map((w) => ({
        name: w.name.length > 14 ? `${w.name.slice(0, 12)}…` : w.name,
        fullName: w.name,
        tasks: w.taskCount,
        overdue: w.overdueCount,
      })),
    [brief.workload]
  );

  const healthLabel =
    brief.health === "critical"
      ? labels.healthCritical
      : brief.health === "watch"
        ? labels.healthWatch
        : labels.healthStable;

  const focusItems = brief.attentionQueue.slice(0, 6);

  const handleKpiClick = useCallback(
    (kpi: KpiDef) => {
      if (kpi.id === "sync") {
        onSync();
        return;
      }
      onNavigate(kpi.tab ?? "tasks", kpi.filter ?? null);
    },
    [onNavigate, onSync]
  );

  return (
    <div className="space-y-4">
      {/* Health + sync strip */}
      <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-gradient-to-br from-background via-muted/20 to-background p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-xl",
              brief.health === "critical"
                ? "bg-rose-500/15 text-rose-700"
                : brief.health === "watch"
                  ? "bg-amber-500/15 text-amber-800"
                  : "bg-emerald-500/15 text-emerald-700"
            )}
          >
            {brief.health === "stable" ? (
              <CheckCircle2Icon className="size-5" />
            ) : (
              <AlertTriangleIcon className="size-5" />
            )}
          </div>
          <div>
            <p className="font-heading text-base font-semibold">{healthLabel}</p>
            <p className="text-muted-foreground text-xs">
              {labels.summaryLastSync}: {formatDt(brief.lastSyncAt, locale)}
              {brief.syncStale ? ` · ${labels.syncStaleHint}` : ""}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onSync}
          disabled={syncing}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-60"
        >
          <RefreshCwIcon className={cn("size-4", syncing && "animate-spin")} />
          {labels.syncWorkspace}
        </button>
      </div>

      {/* Actionable KPIs */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <button
            key={kpi.id}
            type="button"
            onClick={() => handleKpiClick(kpi)}
            className={cn(
              "group rounded-xl border border-border/60 bg-card p-3 text-start shadow-sm transition",
              "hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            )}
            title={buildOdooFilterHref(kpi.tab ?? "tasks", kpi.filter ?? null)}
          >
            <p className="text-muted-foreground text-[11px]">{kpi.label}</p>
            <p
              className={cn(
                "mt-0.5 text-2xl font-bold tabular-nums",
                kpi.tone === "rose" && "text-rose-700",
                kpi.tone === "amber" && "text-amber-800",
                kpi.tone === "violet" && "text-violet-800",
                kpi.tone === "sky" && "text-sky-700",
                kpi.tone === "emerald" && "text-emerald-700",
                kpi.tone === "slate" && "text-foreground"
              )}
            >
              {kpi.value}
            </p>
            <p className="text-primary mt-1 text-[10px] opacity-0 transition group-hover:opacity-100">
              {locale === "en" ? "Click to inspect →" : "انقر للاستعراض ←"}
            </p>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Task distribution chart */}
        <Card className="shadow-sm lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <ClipboardListIcon className="size-4 text-primary" />
              {labels.zoneTasks}
            </CardTitle>
            <CardDescription className="text-xs">{labels.insightsDesc}</CardDescription>
          </CardHeader>
          <CardContent className="h-[200px]">
            {taskChart.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={taskChart}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={2}
                    onClick={(_, i) => {
                      const item = taskChart[i];
                      if (item?.filter) onNavigate("tasks", item.filter);
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    {taskChart.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground flex h-full items-center justify-center text-sm">
                {labels.queueEmpty}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Workload bar chart */}
        <Card className="shadow-sm lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <TrendingUpIcon className="size-4 text-primary" />
              {labels.workloadTitle}
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[200px]">
            {workloadChart.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={workloadChart} layout="vertical" margin={{ left: 8, right: 8 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(v, name) => [v, name === "overdue" ? labels.summaryOverdue : labels.zoneTasks]}
                    labelFormatter={(_, payload) =>
                      payload?.[0] && typeof payload[0] === "object" && "payload" in payload[0]
                        ? String((payload[0] as { payload?: { fullName?: string } }).payload?.fullName ?? "")
                        : ""
                    }
                  />
                  <Bar dataKey="tasks" fill="#6366f1" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="overdue" fill="#e11d48" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground flex h-full items-center justify-center text-sm">
                {labels.queueEmpty}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Coverage snapshot */}
      {coverage ? (
        <Card className="border-dashed shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              {locale === "en" ? "Data coverage" : "تغطية البيانات"}
            </CardTitle>
            <CardDescription className="text-xs">
              {locale === "en" ? "Fetched vs total in Odoo" : "المجلوب مقابل الإجمالي في Odoo"}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <CoverageBar
              label={labels.tabTasks}
              fetched={coverage.tasks?.fetched ?? 0}
              total={coverage.tasks?.total ?? 0}
              onClick={() => onNavigate("tasks")}
            />
            <CoverageBar
              label={labels.tabProjects}
              fetched={coverage.projects?.fetched ?? 0}
              total={coverage.projects?.total ?? 0}
              onClick={() => onNavigate("projects")}
            />
            <CoverageBar
              label={labels.tabCalendar}
              fetched={coverage.calendar?.fetched ?? 0}
              total={coverage.calendar?.totalWindow ?? coverage.calendar?.total ?? 0}
              sub={
                coverage.calendar?.futureArchiveTotal
                  ? `${coverage.calendar.futureArchiveTotal} ${labels.futureCalendarHint}`
                  : undefined
              }
              onClick={() => onNavigate("calendar")}
            />
            <CoverageBar
              label={labels.tabDocuments}
              fetched={coverage.documents?.foldersFetched ?? coverage.folders?.fetched ?? 0}
              total={coverage.documents?.total ?? 0}
              sub={locale === "en" ? "Explorer — folders + on-demand" : "مستكشف — مجلدات عند الطلب"}
              onClick={() => onNavigate("documents")}
            />
          </CardContent>
        </Card>
      ) : null}

      {/* Priority feed */}
      {focusItems.length ? (
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{labels.priorityFeedTitle}</CardTitle>
            <CardDescription className="text-xs">{labels.priorityFeedDesc}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {focusItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "rounded-lg border p-2.5 text-start text-xs transition hover:ring-1 hover:ring-primary/25",
                  severityClass(item.severity)
                )}
                onClick={() => {
                  if (item.kind === "calendar_event") onNavigate("calendar");
                  else if (item.kind === "compliance_doc") onNavigate("documents", "compliance");
                  else if (item.kind === "project") onNavigate("projects");
                  else onNavigate("tasks", "overdue");
                }}
              >
                <div className="flex items-start justify-between gap-1">
                  <p className="line-clamp-2 font-medium">{item.title}</p>
                  <Badge variant="outline" className="shrink-0 text-[9px]">
                    {item.severity}
                  </Badge>
                </div>
                {item.dueLabel ? (
                  <p className="text-muted-foreground mt-1 text-[10px]">
                    {item.daysOffset !== undefined && item.daysOffset < 0
                      ? labels.overdueLabel
                      : labels.daysRemaining}
                    : {item.dueLabel}
                  </p>
                ) : null}
              </button>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* Quick zone links */}
      <div className="grid gap-2 sm:grid-cols-5">
        {[
          { tab: "tasks", label: labels.tabTasks, icon: ClipboardListIcon },
          { tab: "projects", label: labels.tabProjects, icon: FolderKanbanIcon },
          { tab: "calendar", label: labels.tabCalendar, icon: CalendarIcon },
          { tab: "documents", label: labels.tabDocuments, icon: FileStackIcon },
          { tab: "reports", label: labels.tabReports, icon: FileStackIcon },
        ].map((z) => {
          const Icon = z.icon;
          return (
            <button
              key={z.tab}
              type="button"
              onClick={() => onNavigate(z.tab)}
              className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 text-sm font-medium transition hover:bg-muted/50"
            >
              <Icon className="size-4 text-primary" />
              {z.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CoverageBar({
  label,
  fetched,
  total,
  sub,
  onClick,
}: {
  label: string;
  fetched: number;
  total: number;
  sub?: string;
  onClick: () => void;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((fetched / total) * 100)) : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-border/50 bg-background/80 p-2.5 text-start transition hover:border-primary/30"
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {fetched}/{total}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      {sub ? <p className="text-muted-foreground mt-1 text-[10px]">{sub}</p> : null}
    </button>
  );
}
