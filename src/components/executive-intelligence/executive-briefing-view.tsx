import Link from "next/link";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BrainCircuitIcon,
  Building2Icon,
  CheckCircle2Icon,
  SunIcon,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ExecutiveLabels } from "@/lib/executive-intelligence/briefing-labels";
import {
  briefHeadline,
  briefNarratives,
  insightTitle,
  myDayWhy,
  warRoomLabel,
} from "@/lib/executive-intelligence/briefing-labels";
import type { ExecutiveMorningBrief } from "@/lib/executive-intelligence/types";
import type { OperationalHealth } from "@/lib/command-center/odoo-operational-brief";

function healthMeta(health: OperationalHealth, labels: ExecutiveLabels) {
  if (health === "critical")
    return { label: labels.healthCritical, ring: "ring-rose-500/30", badge: "border-rose-500/30 bg-rose-500/10 text-rose-900", icon: AlertTriangleIcon };
  if (health === "watch")
    return { label: labels.healthWatch, ring: "ring-amber-500/30", badge: "border-amber-500/30 bg-amber-500/10 text-amber-900", icon: AlertTriangleIcon };
  return { label: labels.healthStable, ring: "ring-emerald-500/25", badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-800", icon: CheckCircle2Icon };
}

function resolveBriefText(tr: (key: string) => string, key: string, params?: Record<string, string | number>): string {
  let s = tr(`executive.${key}`);
  if (params) for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, String(v));
  return s;
}

export function ExecutiveBriefingView({
  brief,
  labels,
  tr,
  locale,
}: {
  brief: ExecutiveMorningBrief;
  labels: ExecutiveLabels;
  tr: (key: string) => string;
  locale: string;
}) {
  const meta = healthMeta(brief.health, labels);
  const HealthIcon = meta.icon;
  const narratives = briefNarratives(tr, brief);
  const dateLocale = locale === "en" ? "en-GB" : "ar-SA";

  return (
    <div className="mx-auto max-w-[1400px] space-y-8 pb-12">
      <div
        className={cn(
          "relative overflow-hidden rounded-3xl border border-gold/15 bg-linear-to-br from-primary/8 via-white/95 to-amber-500/5 p-6 shadow-[var(--shadow-card-light)] ring-1 sm:p-8",
          meta.ring
        )}
      >
        <div className="pointer-events-none absolute -end-16 -top-16 size-56 rounded-full bg-amber-400/15 blur-3xl" />
        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <SunIcon className="size-3" />
                {labels.briefingEyebrow}
              </Badge>
              <Badge variant="outline" className={meta.badge}>
                <HealthIcon className="size-3" />
                {meta.label}
              </Badge>
            </div>
            <div>
              <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">{labels.briefingTitle}</h1>
              <p className="text-muted-foreground mt-2 max-w-2xl text-sm">{labels.briefingDesc}</p>
            </div>
            <p className="font-heading text-lg font-semibold leading-snug">{briefHeadline(tr, brief)}</p>
            <div className="space-y-2 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-violet-900">
                <BrainCircuitIcon className="size-4" />
                {labels.insightsTitle}
              </div>
              {narratives.map((p, i) => (
                <p key={i} className="text-sm leading-relaxed">
                  {p}
                </p>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/dashboard/odoo" className={cn(buttonVariants({ variant: "default", size: "sm" }))}>
                {labels.openMyDay}
              </Link>
              <Link href="/dashboard/odoo?tab=calendar" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                {labels.openTimeline}
              </Link>
              <Link href="/dashboard/odoo" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                {labels.viewAllWarRooms}
              </Link>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <Pulse label={labels.actionToday} value={brief.counts.actionToday} tone="amber" />
            <Pulse label={labels.criticalRisks} value={brief.counts.criticalRisks} tone="rose" />
            <Pulse label={labels.companiesMonitored} value={brief.tenantCount} tone="sky" />
            <Pulse label={labels.pendingApprovals} value={brief.counts.pendingApprovals} tone="violet" />
            <p className="text-muted-foreground col-span-full text-[11px]">
              {labels.generatedAt}:{" "}
              {new Date(brief.generatedAt).toLocaleString(dateLocale, { dateStyle: "medium", timeStyle: "short" })}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <BriefList title={labels.prioritiesTitle} items={brief.priorityKeys.map((k, i) => resolveBriefText(tr, k.replace("executive.", ""), brief.priorityParams[i]))} />
        <BriefList title={labels.risksTitle} items={brief.riskKeys.map((k, i) => resolveBriefText(tr, k.replace("executive.", ""), brief.riskParams[i]))} tone="rose" />
        <BriefList title={labels.interventionsTitle} items={brief.interventionKeys.map((k, i) => resolveBriefText(tr, k.replace("executive.", ""), brief.interventionParams[i]))} tone="amber" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{labels.insightsTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {brief.insights.map((ins) => (
              <div key={ins.id} className="rounded-xl border border-border/60 bg-muted/20 p-3 text-sm">
                <p>{insightTitle(tr, ins)}</p>
                {ins.actionHref ? (
                  <Link href={ins.actionHref} className="text-primary mt-1 inline-flex items-center gap-1 text-xs font-medium">
                    {tr("executive.insight.actionReview")}
                    <ArrowRightIcon className="size-3" />
                  </Link>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">{labels.myDayTitle}</CardTitle>
              <CardDescription>{labels.myDayDesc}</CardDescription>
            </div>
            <Link href="/dashboard/odoo?tab=tasks" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
              {labels.openMyDay}
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {brief.myDayPreview.map((item) => (
              <div key={item.id} className="rounded-xl border border-border/60 p-3 text-sm">
                <p className="font-medium">{item.title}</p>
                <p className="text-muted-foreground mt-1 text-xs">{myDayWhy(tr, item)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2Icon className="size-4" />
              {labels.warRoomsTitle}
            </CardTitle>
            <CardDescription>{labels.warRoomDesc}</CardDescription>
          </div>
          <Link href="/dashboard/odoo" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            {labels.viewAllWarRooms}
          </Link>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {brief.warRooms.slice(0, 6).map((room) => (
            <Link
              key={room.tenantId}
              href="/dashboard/odoo"
              className="rounded-2xl border border-border/60 p-4 transition hover:border-primary/30 hover:bg-muted/30"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{warRoomLabel(tr, room)}</p>
                <Badge variant="outline" className="text-[10px]">
                  {room.health === "critical" ? labels.healthCritical : room.health === "watch" ? labels.healthWatch : labels.healthStable}
                </Badge>
              </div>
              <p className="text-muted-foreground mt-2 text-xs">
                {room.overdueTasks} overdue · {room.complianceRisks} compliance
              </p>
            </Link>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{labels.complianceTitle}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {brief.complianceHotspots.slice(0, 6).map((c) => (
            <div
              key={c.id}
              className={cn(
                "rounded-xl border p-3 text-sm",
                c.riskLevel === "critical" ? "border-rose-500/30 bg-rose-500/5" : "border-amber-500/30 bg-amber-500/5"
              )}
            >
              <p className="font-medium">{c.name}</p>
              <p className="text-muted-foreground text-xs">{c.tenantName}</p>
              <p className="mt-1 text-xs">{resolveBriefText(tr, c.impactKey.replace("executive.", ""), c.impactParams)}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <a href="/api/reports/executive-daily" className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>
          {labels.reportsDaily}
        </a>
        <a href="/api/reports/odoo-operational" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          {labels.reportsRisk}
        </a>
        <a href="/api/reports/documents" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          {labels.reportsCompliance}
        </a>
      </div>
    </div>
  );
}

function Pulse({ label, value, tone }: { label: string; value: number; tone: "amber" | "rose" | "sky" | "violet" }) {
  const ring = { amber: "ring-amber-500/25", rose: "ring-rose-500/25", sky: "ring-sky-500/25", violet: "ring-violet-500/25" };
  return (
    <div className={cn("rounded-2xl border border-border/60 bg-white/80 p-4 shadow-sm ring-1", ring[tone])}>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function BriefList({ title, items, tone }: { title: string; items: string[]; tone?: "rose" | "amber" }) {
  return (
    <Card className={tone === "rose" ? "ring-1 ring-rose-500/15" : tone === "amber" ? "ring-1 ring-amber-500/15" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {!items.length ? (
          <p className="text-muted-foreground text-sm">—</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {items.map((item, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-primary font-bold">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
