import { AlertCircleIcon, CalendarIcon, ClipboardListIcon, FileWarningIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { OdooBriefLabels } from "@/lib/command-center/odoo-brief-labels";
import type { AttentionItem, OperationalInsight, OdooOperationalBrief } from "@/lib/command-center/odoo-operational-brief";
import { formatInsightText } from "@/lib/command-center/odoo-brief-labels";

function severityBadge(severity: AttentionItem["severity"]) {
  if (severity === "critical") return "border-rose-500/30 bg-rose-500/10 text-rose-800";
  if (severity === "high") return "border-amber-500/30 bg-amber-500/10 text-amber-900";
  return "border-sky-500/30 bg-sky-500/10 text-sky-900";
}

function kindIcon(kind: AttentionItem["kind"]) {
  if (kind === "compliance_doc") return FileWarningIcon;
  if (kind === "calendar_event") return CalendarIcon;
  return ClipboardListIcon;
}

export function AttentionQueuePanel({
  items,
  labels,
}: {
  items: AttentionItem[];
  labels: OdooBriefLabels;
}) {
  return (
    <Card className="shadow-sm ring-1 ring-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{labels.queueTitle}</CardTitle>
        <CardDescription>{labels.attentionDesc}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {!items.length ? (
          <p className="text-muted-foreground py-6 text-center text-sm">{labels.queueEmpty}</p>
        ) : (
          items.map((item) => {
            const Icon = kindIcon(item.kind);
            const kindLabel =
              item.kind === "compliance_doc"
                ? labels.queueKindDoc
                : item.kind === "calendar_event"
                  ? labels.queueKindEvent
                  : labels.queueKindTask;
            return (
              <div
                key={item.id}
                className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/20 p-3"
              >
                <div className="rounded-lg bg-white/80 p-2 shadow-sm">
                  <Icon className="size-4 opacity-70" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium">{item.title}</p>
                    <Badge variant="outline" className={cn("text-[10px]", severityBadge(item.severity))}>
                      {kindLabel}
                    </Badge>
                  </div>
                  {item.subtitle ? (
                    <p className="text-muted-foreground mt-0.5 truncate text-xs">{item.subtitle}</p>
                  ) : null}
                  {item.dueLabel ? (
                    <p className="text-muted-foreground mt-1 text-[11px]">
                      {item.daysOffset !== undefined && item.daysOffset < 0
                        ? labels.overdueLabel
                        : labels.daysRemaining}
                      : {item.dueLabel}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

export function OperationalInsightsPanel({
  insights,
  labels,
}: {
  insights: OperationalInsight[];
  labels: OdooBriefLabels;
}) {
  const severityStyles = {
    critical: "border-rose-500/25 bg-rose-500/5",
    warning: "border-amber-500/25 bg-amber-500/5",
    info: "border-sky-500/25 bg-sky-500/5",
  };

  return (
    <Card className="shadow-sm ring-1 ring-violet-500/15">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertCircleIcon className="size-4 text-violet-600" />
          {labels.insightsTitle}
        </CardTitle>
        <CardDescription>{labels.insightsDesc}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {insights.map((insight) => {
          const { title } = formatInsightText(
            labels,
            insight.titleKey,
            insight.titleParams,
            insight.bodyKey,
            insight.bodyParams
          );
          return (
            <div
              key={insight.id}
              className={cn("rounded-xl border p-4 text-sm leading-relaxed", severityStyles[insight.severity])}
            >
              {title}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function WorkloadPanel({
  workload,
  labels,
}: {
  workload: OdooOperationalBrief["workload"];
  labels: OdooBriefLabels;
}) {
  if (!workload.length) return null;

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{labels.workloadTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {workload.slice(0, 5).map((w) => (
          <div key={w.name} className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-3 py-2 text-sm">
            <span className="font-medium">{w.name}</span>
            <span className="text-muted-foreground tabular-nums text-xs">
              {w.taskCount}
              {w.overdueCount > 0 ? ` · ${w.overdueCount} overdue` : ""}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
