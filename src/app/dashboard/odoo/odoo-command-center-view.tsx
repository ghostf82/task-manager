import Link from "next/link";
import { Suspense } from "react";
import {
  AlertTriangleIcon,
  CalendarIcon,
  CheckCircle2Icon,
  FileStackIcon,
  FolderKanbanIcon,
  SparklesIcon,
} from "lucide-react";

import { OdooTasksPanelWithCache } from "@/app/dashboard/ai-agent/odoo-tasks-panel-server";
import {
  CommandCenterShell,
  CommandQuickLink,
  KpiCard,
} from "@/components/command-center/command-center-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { OdooCommandMetrics } from "@/lib/command-center/odoo-metrics";
import { cn } from "@/lib/utils";

function formatDt(iso: string | null, locale: string) {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleString(locale === "en" ? "en-GB" : "ar-SA");
}

export function OdooCommandCenterView({
  metrics,
  locale,
  t,
}: {
  metrics: OdooCommandMetrics;
  locale: string;
  t: (key: string) => string;
}) {
  const dateLocale = locale === "en" ? "en-GB" : "ar-SA";

  if (!metrics.connected) {
    return (
      <CommandCenterShell
        eyebrow={t("commandCenter.odoo.eyebrow")}
        title={t("commandCenter.odoo.title")}
        description={t("commandCenter.odoo.desc")}
        status={
          <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-900">
            {t("commandCenter.odoo.notLinked")}
          </Badge>
        }
        actions={
          <>
            <CommandQuickLink href="/dashboard/settings/integrations" label={t("commandCenter.odoo.linkAccount")} />
          </>
        }
      >
        <Card className="border-amber-500/25">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {t("commandCenter.odoo.linkPrompt")}
          </CardContent>
        </Card>
      </CommandCenterShell>
    );
  }

  return (
    <CommandCenterShell
      eyebrow={t("commandCenter.odoo.eyebrow")}
      title={t("commandCenter.odoo.title")}
      description={t("commandCenter.odoo.desc")}
      status={
        <Badge
          variant="outline"
          className="border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
        >
          <CheckCircle2Icon className="size-3" />
          {t("commandCenter.odoo.live")}
        </Badge>
      }
      actions={
        <>
          <CommandQuickLink href="/dashboard/ai-agent" label={t("commandCenter.odoo.aiBrief")} variant="default" />
          <CommandQuickLink href="/dashboard/settings/integrations" label={t("commandCenter.odoo.settings")} />
          {metrics.baseUrl ? (
            <a
              href={metrics.baseUrl}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8")}
            >
              {t("commandCenter.odoo.openOdoo")}
            </a>
          ) : null}
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        <KpiCard label={t("commandCenter.odoo.kpiTasks")} value={metrics.openTasks} tone="violet" />
        <KpiCard
          label={t("commandCenter.odoo.kpiOverdue")}
          value={metrics.overdueTasks}
          hint={t("commandCenter.odoo.kpiOverdueHint")}
          tone={metrics.overdueTasks > 0 ? "rose" : "default"}
        />
        <KpiCard
          label={t("commandCenter.odoo.kpiDueToday")}
          value={metrics.tasksDueToday}
          tone={metrics.tasksDueToday > 0 ? "amber" : "default"}
        />
        <KpiCard label={t("commandCenter.odoo.kpiPriority")} value={metrics.highPriorityTasks} tone="amber" />
        <KpiCard label={t("commandCenter.odoo.kpiProjects")} value={metrics.projects} tone="emerald" />
        <KpiCard label={t("commandCenter.odoo.kpiEvents")} value={metrics.calendarEvents} tone="sky" />
        <KpiCard label={t("commandCenter.odoo.kpiDocuments")} value={metrics.documents} tone="default" />
        <KpiCard
          label={t("commandCenter.odoo.kpiSync")}
          value={formatDt(metrics.lastSyncAt, dateLocale)}
          hint={metrics.loginUsername ?? undefined}
          tone="default"
        />
      </div>

      {(metrics.overdueTasks > 0 || metrics.highPriorityTasks > 0) && (
        <Card className="border-amber-500/25 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangleIcon className="size-4 text-amber-600" />
              {t("commandCenter.odoo.riskTitle")}
            </CardTitle>
            <CardDescription>{t("commandCenter.odoo.riskDesc")}</CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-heading text-lg font-semibold">{t("commandCenter.odoo.workspaceTitle")}</h2>
          </div>
          <Suspense
            fallback={
              <Card>
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  {t("common.loading")}
                </CardContent>
              </Card>
            }
          >
            <OdooTasksPanelWithCache />
          </Suspense>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("commandCenter.odoo.sideOpsTitle")}</CardTitle>
              <CardDescription>{t("commandCenter.odoo.sideOpsDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Link href="/dashboard/ai-agent" className={cn(buttonVariants({ variant: "outline" }), "justify-start")}>
                <SparklesIcon className="size-4" />
                {t("commandCenter.odoo.sideScan")}
              </Link>
              <Link href="/dashboard/documents" className={cn(buttonVariants({ variant: "outline" }), "justify-start")}>
                <FileStackIcon className="size-4" />
                {t("commandCenter.odoo.sideDocs")}
              </Link>
              <Link href="/dashboard/tasks" className={cn(buttonVariants({ variant: "outline" }), "justify-start")}>
                <FolderKanbanIcon className="size-4" />
                {t("commandCenter.odoo.sideCorpTasks")}
              </Link>
            </CardContent>
          </Card>

          <Card className="border-violet-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarIcon className="size-4" />
                {t("commandCenter.odoo.reportsTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <p className="text-muted-foreground text-xs leading-relaxed">{t("commandCenter.odoo.reportsDesc")}</p>
              <p className="text-muted-foreground text-xs">{t("commandCenter.odoo.reportsHint")}</p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </CommandCenterShell>
  );
}
