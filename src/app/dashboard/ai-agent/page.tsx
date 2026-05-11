import Link from "next/link";

import { analyzePasteAction } from "@/app/dashboard/ai-agent/actions";
import { InboundScanCard } from "@/app/dashboard/ai-agent/inbound-scan-card";
import { OdooTasksPanelDynamic } from "@/app/dashboard/ai-agent/odoo-tasks-panel-dynamic";
import {
  PendingProposalsPanel,
  type PendingProposalRow,
} from "@/app/dashboard/ai-agent/pending-proposals-panel";
import { getAiToolBySlug } from "@/lib/ai-tools/registry";
import { getLicensedActiveToolSlugs } from "@/lib/ai-tools/user-licenses";
import { requireSession } from "@/lib/dashboard-auth";
import { getTranslator } from "@/lib/i18n/get-translator";
import { dateLocaleFor, type AppLocale } from "@/lib/i18n/locale-core";
import { createClient } from "@/lib/supabase/server";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Odoo calendar clone + many `calendar.event.agenda.item` creates can exceed default
 * serverless limits; raise cap where the host honors Next route segment config (e.g. Netlify).
 */
export const maxDuration = 120;

function toolLabelForLocale(locale: AppLocale, slug: string): string | undefined {
  const tool = getAiToolBySlug(slug);
  if (!tool) return undefined;
  return locale === "en" ? tool.displayNameEn : tool.displayNameAr;
}

function joinToolLabels(locale: AppLocale, slugs: string[]): string {
  const labels = slugs.map((s) => toolLabelForLocale(locale, s)).filter(Boolean) as string[];
  return labels.join(locale === "en" ? ", " : "\u060c ");
}

export default async function AiAgentPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const sp = await searchParams;
  const { t, locale } = await getTranslator();
  const dateLocale = dateLocaleFor(locale);
  const session = await requireSession();
  const supabase = await createClient();

  const licensedSlugs = await getLicensedActiveToolSlugs(supabase, session.id);
  const licensedToolLabels = joinToolLabels(locale, licensedSlugs);

  const { data: odoo } = await supabase
    .from("user_odoo_credentials")
    .select("user_id")
    .eq("user_id", session.id)
    .maybeSingle();

  const { data: emailCreds } = await supabase
    .from("user_email_credentials")
    .select("user_id")
    .eq("user_id", session.id)
    .maybeSingle();

  const { data: memberships } = await supabase
    .from("tenant_memberships")
    .select("tenant_id, tenants(name)")
    .eq("user_id", session.id)
    .eq("status", "active");

  const tenantOptions =
    memberships?.flatMap((m) => {
      const tn = m.tenants;
      if (tn && typeof tn === "object" && !Array.isArray(tn) && "name" in tn) {
        return [{ id: m.tenant_id as string, name: String((tn as { name: string }).name) }];
      }
      if (Array.isArray(tn) && tn[0] && typeof tn[0] === "object" && "name" in tn[0]) {
        return [{ id: m.tenant_id as string, name: String((tn[0] as { name: string }).name) }];
      }
      return [];
    }) ?? [];

  const { data: pending } = await supabase
    .from("ai_agent_proposals")
    .select("id,kind,title,summary,detail_json,proposed_action,created_at")
    .eq("user_id", session.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const { data: activity } = await supabase
    .from("ai_agent_activity_log")
    .select("id,event_type,message,proposal_id,created_at,meta")
    .eq("user_id", session.id)
    .order("created_at", { ascending: false })
    .limit(80);

  const okMsgs: Record<string, string> = {
    analysis: t("aiAgentPage.okAnalysis"),
    executed: t("aiAgentPage.okExecuted"),
    rejected: t("aiAgentPage.okRejected"),
  };

  const errMsgs: Record<string, string> = {
    text: t("aiAgentPage.errText"),
    llm: t("aiAgentPage.errLlm"),
    insert: t("aiAgentPage.errInsert"),
    proposal: t("aiAgentPage.errProposal"),
    not_pending: t("aiAgentPage.errNotPending"),
  };

  const okMsg = sp.ok ? okMsgs[sp.ok] : null;
  const errMsg = sp.err ? errMsgs[sp.err] ?? t("aiAgentPage.errGeneric") : null;

  const vaultReadyOdoo = Boolean(odoo);
  const vaultReadyEmail = Boolean(emailCreds);
  const canRunInboundScan = licensedSlugs.length > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="premium-hero p-6 md:p-8">
        <div className="pointer-events-none absolute -end-20 -top-20 size-64 rounded-full bg-white/20 blur-3xl" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-widest">
              {t("aiAgentPage.phaseLabel")}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
              {t("aiAgentPage.heroTitle")}
            </h1>
            <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-relaxed">
              {t("aiAgentPage.heroLead")}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            <Link
              href="/dashboard/settings/integrations"
              className={cn(buttonVariants({ variant: "secondary" }), "shadow-sm")}
            >
              {t("aiAgentPage.vaultLink")}
            </Link>
            {!licensedSlugs.length ? (
              <p className="max-w-xs text-[11px] leading-relaxed text-amber-100">
                {t("aiAgentPage.bannerNoTools")}
              </p>
            ) : !vaultReadyOdoo && !vaultReadyEmail ? (
              <p className="max-w-xs text-[11px] leading-relaxed text-amber-100">
                {t("aiAgentPage.bannerVaultNeeded").replace("{tools}", licensedToolLabels)}
              </p>
            ) : (
              <p className="max-w-xs text-[11px] leading-relaxed text-white/85">
                {t("aiAgentPage.bannerReady").replace("{tools}", licensedToolLabels)}
              </p>
            )}
          </div>
        </div>
      </div>

      {okMsg ? (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
          {okMsg}
        </p>
      ) : null}
      {errMsg ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errMsg}
        </p>
      ) : null}

      <InboundScanCard
        canScan={canRunInboundScan}
        licensedToolLabels={licensedToolLabels}
      />

      <OdooTasksPanelDynamic />

      <div className="grid gap-6 lg:grid-cols-2">
        <PendingProposalsPanel proposals={(pending ?? []) as PendingProposalRow[]} />

        <Card className="border-border/80 shadow-md ring-1 ring-cyan-500/10">
          <CardHeader>
            <CardTitle>{t("aiAgentPage.analyzeTitle")}</CardTitle>
            <CardDescription>{t("aiAgentPage.analyzeDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={analyzePasteAction} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="tenant_id">{t("aiAgentPage.labelTenant")}</Label>
                <select
                  id="tenant_id"
                  name="tenant_id"
                  className="h-9 w-full rounded-xl border border-input/80 bg-white/75 px-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] backdrop-blur-sm"
                  defaultValue=""
                >
                  <option value="">{t("aiAgentPage.tenantNone")}</option>
                  {tenantOptions.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="text">{t("aiAgentPage.labelText")}</Label>
                <Textarea
                  id="text"
                  name="text"
                  required
                  rows={8}
                  placeholder={t("aiAgentPage.textPlaceholder")}
                  className="min-h-[140px] resize-y text-sm leading-relaxed"
                />
              </div>
              <Button type="submit" className="w-fit">
                {t("aiAgentPage.analyzeSubmit")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("aiAgentPage.logTitle")}</CardTitle>
          <CardDescription>{t("aiAgentPage.logSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-start text-muted-foreground">
                <th className="py-2 pe-4 font-medium">{t("aiAgentPage.logColTime")}</th>
                <th className="py-2 pe-4 font-medium">{t("aiAgentPage.logColType")}</th>
                <th className="py-2 pe-4 font-medium">{t("aiAgentPage.logColMessage")}</th>
              </tr>
            </thead>
            <tbody>
              {!activity?.length ? (
                <tr>
                  <td colSpan={3} className="text-muted-foreground py-6 text-center">
                    {t("aiAgentPage.logEmpty")}
                  </td>
                </tr>
              ) : (
                activity.map((row) => (
                  <tr key={row.id} className="border-b border-border/70 align-top">
                    <td className="py-2 pe-4 whitespace-nowrap text-[12px] text-muted-foreground">
                      {new Date(row.created_at).toLocaleString(dateLocale, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="py-2 pe-4 font-mono text-[11px] [direction:ltr]">
                      {row.event_type}
                    </td>
                    <td className="py-2 text-[13px] leading-relaxed">{row.message}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
