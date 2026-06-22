"use client";

import Link from "next/link";
import { useState } from "react";
import {
  CalendarIcon,
  ClipboardListIcon,
  FileStackIcon,
  FileTextIcon,
  FolderKanbanIcon,
  LayoutGridIcon,
  ShieldCheckIcon,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { OdooBriefLabels } from "@/lib/command-center/odoo-brief-labels";
import type { ComplianceMonitorItem, OdooOperationalBrief } from "@/lib/command-center/odoo-operational-brief";

type Zone = "brief" | "compliance" | "tasks" | "projects" | "calendar" | "documents" | "reports";

function zoneHref(zone: Exclude<Zone, "brief" | "reports" | "compliance">) {
  return `/dashboard/odoo/workspace?zone=${zone}`;
}

export function OdooWorkCenters({
  brief,
  labels,
}: {
  brief: OdooOperationalBrief;
  labels: OdooBriefLabels;
}) {
  const [zone, setZone] = useState<Zone>("brief");

  const tabs: { id: Zone; label: string; icon: typeof LayoutGridIcon }[] = [
    { id: "brief", label: labels.zoneBrief, icon: LayoutGridIcon },
    { id: "compliance", label: labels.zoneCompliance, icon: ShieldCheckIcon },
    { id: "tasks", label: labels.zoneTasks, icon: ClipboardListIcon },
    { id: "projects", label: labels.zoneProjects, icon: FolderKanbanIcon },
    { id: "calendar", label: labels.zoneCalendar, icon: CalendarIcon },
    { id: "documents", label: labels.zoneDocuments, icon: FileStackIcon },
    { id: "reports", label: labels.zoneReports, icon: FileTextIcon },
  ];

  return (
    <div className="space-y-4">
      <h2 className="font-heading text-lg font-semibold">{labels.workCentersTitle}</h2>
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setZone(tab.id)}
              className={cn(
                buttonVariants({ variant: zone === tab.id ? "default" : "outline", size: "sm" }),
                "gap-1.5"
              )}
            >
              <Icon className="size-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {zone === "brief" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{labels.attentionTitle}</CardTitle>
            <CardDescription>{labels.attentionDesc}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <Stat label={labels.dueToday} value={brief.counts.dueTodayTasks} />
            <Stat label={labels.due7} value={brief.counts.due7Days} />
            <Stat label={labels.complianceRisk} value={brief.counts.complianceWarning + brief.counts.complianceOverdue} />
          </CardContent>
        </Card>
      ) : null}

      {zone === "compliance" ? (
        <ComplianceZone items={brief.complianceItems} labels={labels} />
      ) : null}

      {zone === "reports" ? <ReportsZone labels={labels} /> : null}

      {zone !== "brief" && zone !== "compliance" && zone !== "reports" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{tabs.find((t) => t.id === zone)?.label}</CardTitle>
            <CardDescription>{labels.openWorkspaceSection}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href={zoneHref(zone)}
              className={cn(buttonVariants({ variant: "default" }), "w-full sm:w-auto")}
            >
              {labels.openWorkspace}
            </Link>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-center">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function ComplianceZone({
  items,
  labels,
}: {
  items: ComplianceMonitorItem[];
  labels: OdooBriefLabels;
}) {
  const urgent = items.filter((i) => i.tone !== "ok");

  return (
    <Card className="ring-1 ring-amber-500/15">
      <CardHeader>
        <CardTitle className="text-base">{labels.complianceTitle}</CardTitle>
        <CardDescription>{labels.complianceDesc}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {!urgent.length ? (
          <p className="text-muted-foreground py-6 text-center text-sm">{labels.complianceEmpty}</p>
        ) : (
          urgent.slice(0, 15).map((item) => {
            const sourceLabel =
              item.source === "company_document"
                ? labels.complianceSourceDoc
                : item.source === "odoo_task"
                  ? labels.complianceSourceTask
                  : labels.complianceSourceProject;
            const toneClass =
              item.tone === "overdue"
                ? "border-rose-500/30 bg-rose-500/5"
                : "border-amber-500/30 bg-amber-500/5";
            return (
              <div key={item.id} className={cn("rounded-xl border p-3 text-sm", toneClass)}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{item.name}</p>
                  <span className="text-muted-foreground text-[11px]">{sourceLabel}</span>
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  {labels.categoryLabels[item.category]}
                  {item.tenantOrProject ? ` · ${item.tenantOrProject}` : ""}
                </p>
                {item.expiryOrDeadline ? (
                  <p className="mt-1 text-[11px] font-medium">
                    {item.daysRemaining !== undefined && item.daysRemaining < 0
                      ? labels.overdueLabel
                      : labels.daysRemaining}
                    : {item.expiryOrDeadline}
                    {item.daysRemaining !== undefined ? ` (${item.daysRemaining}d)` : ""}
                  </p>
                ) : null}
              </div>
            );
          })
        )}
        <div className="pt-2">
          <Link href="/dashboard/documents" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            {labels.complianceSourceDoc}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function ReportsZone({ labels }: { labels: OdooBriefLabels }) {
  const reports = [
    { href: "/api/reports/odoo-operational", label: labels.reportOperationalPdf },
    { href: "/api/reports/documents", label: labels.reportComplianceExcel },
    { href: "/api/reports/tasks?format=pdf", label: labels.reportTasksPdf },
    { href: "/api/reports/tasks", label: labels.reportTasksExcel },
    { href: "/dashboard/odoo/workspace?zone=tasks", label: labels.reportOdooExcel },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{labels.reportsTitle}</CardTitle>
        <CardDescription>{labels.reportsDesc}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        {reports.map((r) => (
          <a
            key={r.href}
            href={r.href}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "h-auto min-h-10 justify-start whitespace-normal py-2 text-start"
            )}
          >
            {r.label}
          </a>
        ))}
      </CardContent>
    </Card>
  );
}
