import Link from "next/link";
import { MailIcon, SparklesIcon } from "lucide-react";

import { refreshEmailIntelligenceAction } from "@/app/dashboard/email/actions";
import {
  CommandCenterShell,
  CommandQuickLink,
  KpiCard,
} from "@/components/command-center/command-center-shell";
import { PendingSubmitButton } from "@/app/dashboard/settings/integrations/integrations-connection-test";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EmailCommandMetrics } from "@/lib/command-center/email-intelligence";
import { cn } from "@/lib/utils";

export type EmailCenterLabels = {
  eyebrow: string;
  title: string;
  desc: string;
  notLinked: string;
  linkAccount: string;
  linkPrompt: string;
  refresh: string;
  refreshing: string;
  aiScan: string;
  settings: string;
  kpiUnread: string;
  kpiHigh: string;
  kpiFollowUp: string;
  kpiFetched: string;
  inboxTitle: string;
  inboxDesc: string;
  inboxEmpty: string;
  noSubject: string;
  priorityHigh: string;
  priorityNormal: string;
  priorityLow: string;
  followUp: string;
  ageHours: string;
  aiTitle: string;
  aiDesc: string;
  runScan: string;
  workflowTitle: string;
  workflowDesc: string;
};

function priorityBadge(priority: string, labels: EmailCenterLabels) {
  if (priority === "high") {
    return (
      <Badge className="border-rose-500/30 bg-rose-500/10 text-rose-800" variant="outline">
        {labels.priorityHigh}
      </Badge>
    );
  }
  if (priority === "normal") {
    return (
      <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-900" variant="outline">
        {labels.priorityNormal}
      </Badge>
    );
  }
  return <Badge variant="outline">{labels.priorityLow}</Badge>;
}

export function EmailIntelligenceCenterView({
  metrics,
  locale,
  labels,
}: {
  metrics: EmailCommandMetrics;
  locale: string;
  labels: EmailCenterLabels;
}) {
  const dateLocale = locale === "en" ? "en-GB" : "ar-SA";

  if (!metrics.connected) {
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
        actions={
          <CommandQuickLink href="/dashboard/settings/integrations" label={labels.linkAccount} />
        }
      >
        <Card className="border-amber-500/25">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">{labels.linkPrompt}</CardContent>
        </Card>
      </CommandCenterShell>
    );
  }

  return (
    <CommandCenterShell
      eyebrow={labels.eyebrow}
      title={labels.title}
      description={labels.desc}
      status={
        <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-sky-900">
          <MailIcon className="size-3" />
          {metrics.mailboxUser}
        </Badge>
      }
      actions={
        <>
          <form action={refreshEmailIntelligenceAction}>
            <PendingSubmitButton label={labels.refresh} pendingLabel={labels.refreshing} variant="default" />
          </form>
          <CommandQuickLink href="/dashboard/ai-agent" label={labels.aiScan} />
          <CommandQuickLink href="/dashboard/settings/integrations" label={labels.settings} />
        </>
      }
    >
      {metrics.error ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-4 text-sm text-destructive">{metrics.error}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={labels.kpiUnread} value={metrics.unreadTotal} tone="sky" />
        <KpiCard
          label={labels.kpiHigh}
          value={metrics.highPriority}
          tone={metrics.highPriority > 0 ? "rose" : "default"}
        />
        <KpiCard
          label={labels.kpiFollowUp}
          value={metrics.needsFollowUp}
          tone={metrics.needsFollowUp > 0 ? "amber" : "default"}
        />
        <KpiCard
          label={labels.kpiFetched}
          value={new Date(metrics.fetchedAt).toLocaleString(dateLocale)}
          hint={metrics.imapHost ?? undefined}
          tone="default"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <Card>
          <CardHeader>
            <CardTitle>{labels.inboxTitle}</CardTitle>
            <CardDescription>{labels.inboxDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {metrics.messages.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">{labels.inboxEmpty}</p>
            ) : (
              metrics.messages.map((msg) => (
                <div
                  key={`${msg.uid}-${msg.messageId}`}
                  className="rounded-xl border border-border/70 bg-white/70 p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{msg.subject || labels.noSubject}</p>
                      <p className="text-muted-foreground truncate text-xs">{msg.from}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {priorityBadge(msg.priority, labels)}
                      {msg.needsFollowUp ? (
                        <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10">
                          {labels.followUp}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <p className="text-muted-foreground mt-2 line-clamp-2 text-xs leading-relaxed">
                    {msg.textPreview || "—"}
                  </p>
                  <div className="text-muted-foreground mt-2 flex flex-wrap gap-3 text-[11px]">
                    <span>{new Date(msg.date).toLocaleString(dateLocale)}</span>
                    <span>
                      {labels.ageHours}: {msg.ageHours}
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <aside className="space-y-4">
          <Card className="border-violet-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <SparklesIcon className="size-4" />
                {labels.aiTitle}
              </CardTitle>
              <CardDescription>{labels.aiDesc}</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/dashboard/ai-agent" className={cn(buttonVariants({ variant: "default" }), "w-full")}>
                {labels.runScan}
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{labels.workflowTitle}</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground space-y-2 text-xs leading-relaxed">
              <p>{labels.workflowDesc}</p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </CommandCenterShell>
  );
}

export function buildEmailCenterLabels(t: (key: string) => string): EmailCenterLabels {
  return {
    eyebrow: t("commandCenter.email.eyebrow"),
    title: t("commandCenter.email.title"),
    desc: t("commandCenter.email.desc"),
    notLinked: t("commandCenter.email.notLinked"),
    linkAccount: t("commandCenter.email.linkAccount"),
    linkPrompt: t("commandCenter.email.linkPrompt"),
    refresh: t("commandCenter.email.refresh"),
    refreshing: t("commandCenter.email.refreshing"),
    aiScan: t("commandCenter.email.aiScan"),
    settings: t("commandCenter.email.settings"),
    kpiUnread: t("commandCenter.email.kpiUnread"),
    kpiHigh: t("commandCenter.email.kpiHigh"),
    kpiFollowUp: t("commandCenter.email.kpiFollowUp"),
    kpiFetched: t("commandCenter.email.kpiFetched"),
    inboxTitle: t("commandCenter.email.inboxTitle"),
    inboxDesc: t("commandCenter.email.inboxDesc"),
    inboxEmpty: t("commandCenter.email.inboxEmpty"),
    noSubject: t("commandCenter.email.noSubject"),
    priorityHigh: t("commandCenter.email.priorityHigh"),
    priorityNormal: t("commandCenter.email.priorityNormal"),
    priorityLow: t("commandCenter.email.priorityLow"),
    followUp: t("commandCenter.email.followUp"),
    ageHours: t("commandCenter.email.ageHours"),
    aiTitle: t("commandCenter.email.aiTitle"),
    aiDesc: t("commandCenter.email.aiDesc"),
    runScan: t("commandCenter.email.runScan"),
    workflowTitle: t("commandCenter.email.workflowTitle"),
    workflowDesc: t("commandCenter.email.workflowDesc"),
  };
}
