import Link from "next/link";
import {
  AlertTriangleIcon,
  BrainCircuitIcon,
  CheckCircle2Icon,
  RefreshCwIcon,
  SparklesIcon,
} from "lucide-react";

import { CommandCenterShell, CommandQuickLink } from "@/components/command-center/command-center-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OdooBriefLabels } from "@/lib/command-center/odoo-brief-labels";
import type { OdooOperationalBrief } from "@/lib/command-center/odoo-operational-brief";

function formatDt(iso: string | null, locale: string) {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleString(locale === "en" ? "en-GB" : "ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function healthLabel(labels: OdooBriefLabels, health: OdooOperationalBrief["health"]) {
  if (health === "critical") return labels.healthCritical;
  if (health === "watch") return labels.healthWatch;
  return labels.healthStable;
}

function healthStyles(health: OdooOperationalBrief["health"]) {
  if (health === "critical") {
    return {
      ring: "ring-rose-500/30",
      bg: "from-rose-500/10 via-white/90 to-amber-500/5",
      badge: "border-rose-500/30 bg-rose-500/10 text-rose-900",
      icon: AlertTriangleIcon,
    };
  }
  if (health === "watch") {
    return {
      ring: "ring-amber-500/30",
      bg: "from-amber-500/10 via-white/90 to-primary/5",
      badge: "border-amber-500/30 bg-amber-500/10 text-amber-900",
      icon: AlertTriangleIcon,
    };
  }
  return {
    ring: "ring-emerald-500/25",
    bg: "from-emerald-500/8 via-white/90 to-cyan-500/5",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-800",
    icon: CheckCircle2Icon,
  };
}

function narrative(labels: OdooBriefLabels, brief: OdooOperationalBrief): string {
  const p = brief.counts;
  if (brief.health === "critical") {
    return labels.narrativeCritical
      .replace("{overdue}", String(p.overdueTasks))
      .replace("{compliance}", String(p.complianceOverdue))
      .replace("{today}", String(brief.attentionToday));
  }
  if (brief.health === "watch") {
    return labels.narrativeWatch
      .replace("{today}", String(p.dueTodayTasks))
      .replace("{week}", String(p.due7Days))
      .replace("{compliance}", String(p.complianceWarning));
  }
  return labels.narrativeStable.replace("{open}", String(p.openTasks));
}

export function ExecutiveBriefHero({
  brief,
  labels,
  locale,
}: {
  brief: OdooOperationalBrief;
  labels: OdooBriefLabels;
  locale: string;
}) {
  const styles = healthStyles(brief.health);
  const HealthIcon = styles.icon;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border border-gold/15 bg-linear-to-br p-6 shadow-[var(--shadow-card-light)] ring-1 sm:p-8",
        styles.bg,
        styles.ring
      )}
    >
      <div className="pointer-events-none absolute -start-16 -top-16 size-48 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={styles.badge}>
              <HealthIcon className="size-3" />
              {healthLabel(labels, brief.health)}
            </Badge>
            {brief.syncStale ? (
              <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-900">
                <RefreshCwIcon className="size-3" />
                {labels.syncStaleHint}
              </Badge>
            ) : null}
          </div>

          <div>
            <p className="text-primary/80 text-xs font-semibold tracking-[0.2em] uppercase">{labels.eyebrow}</p>
            <h1 className="font-heading mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{labels.title}</h1>
            <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-relaxed">{labels.desc}</p>
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4">
            <BrainCircuitIcon className="mt-0.5 size-5 shrink-0 text-violet-600" />
            <p className="text-sm leading-relaxed">{narrative(labels, brief)}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <CommandQuickLink href="/dashboard/odoo?tab=tasks" label={labels.syncWorkspace} variant="default" />
            <CommandQuickLink href="/dashboard/ai-agent" label={labels.aiBrief} />
            <CommandQuickLink href="/dashboard/settings/integrations" label={labels.settings} />
            {brief.baseUrl ? (
              <a
                href={brief.baseUrl}
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8")}
              >
                {labels.openOdoo}
              </a>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <div className="rounded-2xl border border-border/60 bg-white/80 p-4 shadow-sm">
            <p className="text-muted-foreground text-xs font-medium">{labels.actionToday}</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{brief.attentionToday}</p>
            <p className="text-muted-foreground mt-1 text-[11px]">{labels.attentionToday}</p>
          </div>
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 shadow-sm">
            <p className="text-xs font-medium text-rose-800">{labels.attentionCritical}</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-rose-900">{brief.attentionCritical}</p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-white/80 p-4 shadow-sm sm:col-span-2 lg:col-span-1">
            <p className="text-muted-foreground text-xs font-medium">{labels.lastSync}</p>
            <p className="mt-1 text-sm font-semibold">{formatDt(brief.lastSyncAt, locale)}</p>
            {brief.loginUsername ? (
              <p className="text-muted-foreground mt-1 text-[11px]">{brief.loginUsername}</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ExecutiveBriefShellDisconnected({ labels }: { labels: OdooBriefLabels }) {
  return (
    <CommandCenterShell
      eyebrow={labels.eyebrow}
      title={labels.title}
      description={labels.desc}
      status={
        <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-900">
          {labels.notLinked}
        </Badge>
      }
      actions={<CommandQuickLink href="/dashboard/settings/integrations" label={labels.linkAccount} />}
    >
      <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 py-12 text-center text-sm text-muted-foreground">
        {labels.linkPrompt}
      </div>
    </CommandCenterShell>
  );
}

export function ActionPulseStrip({
  labels,
  counts,
}: {
  labels: OdooBriefLabels;
  counts: OdooOperationalBrief["counts"];
}) {
  const items = [
    { label: labels.dueToday, value: counts.dueTodayTasks, tone: counts.dueTodayTasks > 0 ? "amber" : "default" },
    { label: labels.due7, value: counts.due7Days, tone: counts.due7Days > 0 ? "sky" : "default" },
    { label: labels.complianceRisk, value: counts.complianceWarning + counts.complianceOverdue, tone: counts.complianceOverdue > 0 ? "rose" : counts.complianceWarning > 0 ? "amber" : "default" },
    { label: labels.unassigned, value: counts.unassignedTasks, tone: counts.unassignedTasks > 0 ? "violet" : "default" },
    { label: labels.eventsToday, value: counts.eventsToday, tone: counts.eventsToday > 0 ? "emerald" : "default" },
  ] as const;

  const ring = {
    default: "ring-gold/15",
    amber: "ring-amber-500/25",
    rose: "ring-rose-500/25",
    sky: "ring-sky-500/25",
    violet: "ring-violet-500/25",
    emerald: "ring-emerald-500/25",
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {items.map((item) => (
        <div
          key={item.label}
          className={cn(
            "rounded-2xl border border-border/60 bg-white/75 p-4 shadow-sm ring-1 backdrop-blur-sm",
            ring[item.tone]
          )}
        >
          <p className="text-muted-foreground text-xs font-medium">{item.label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

export function AiInsightLink({ labels }: { labels: OdooBriefLabels }) {
  return (
    <Link
      href="/dashboard/ai-agent"
      className="flex items-center gap-2 rounded-xl border border-violet-500/20 bg-violet-500/5 px-4 py-3 text-sm font-medium text-violet-900 transition hover:bg-violet-500/10"
    >
      <SparklesIcon className="size-4" />
      {labels.aiBrief}
    </Link>
  );
}
