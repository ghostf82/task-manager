import Link from "next/link";

import {
  deleteEmailCredentialsAction,
  saveEmailCredentialsAction,
} from "@/app/dashboard/settings/integrations/actions";
import {
  EmailConnectionTestButton,
  PendingSubmitButton,
} from "@/app/dashboard/settings/integrations/integrations-connection-test";
import { OdooCompanyAdminSection } from "@/app/dashboard/settings/integrations/odoo-company-admin-section";
import { OdooUserLinkCard } from "@/app/dashboard/settings/integrations/odoo-user-link-card";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireSession } from "@/lib/dashboard-auth";
import { getTranslator } from "@/lib/i18n/get-translator";
import { getLicensedActiveToolSlugs } from "@/lib/ai-tools/user-licenses";
import { loadCompanyOdooSettings } from "@/lib/integrations/company-odoo-settings";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export default async function IntegrationsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; err?: string }>;
}) {
  const sp = await searchParams;
  const session = await requireSession();
  const { t, locale } = await getTranslator();
  const supabase = await createClient();

  const licensedSlugs = await getLicensedActiveToolSlugs(supabase, session.id);
  const showOdoo = licensedSlugs.includes("odoo");
  const showEmail = licensedSlugs.includes("email");

  const companyOdoo = showOdoo ? await loadCompanyOdooSettings(supabase) : null;

  const { data: odoo } = showOdoo
    ? await supabase
        .from("user_odoo_credentials")
        .select("login_username, updated_at")
        .eq("user_id", session.id)
        .maybeSingle()
    : { data: null };

  let odooLastSyncAt: string | null = null;
  if (showOdoo) {
    const { data: cacheRows } = await supabase
      .from("odoo_browser_cache")
      .select("updated_at")
      .eq("user_id", session.id);
    const times = (cacheRows ?? [])
      .map((r) => Date.parse(String(r.updated_at)))
      .filter((n) => Number.isFinite(n));
    if (times.length) {
      odooLastSyncAt = new Date(Math.max(...times)).toISOString();
    }
  }

  const { data: email } = await supabase
    .from("user_email_credentials")
    .select(
      "imap_host, imap_port, imap_use_tls, imap_username, smtp_host, smtp_port, smtp_use_tls, smtp_username, updated_at",
    )
    .eq("user_id", session.id)
    .maybeSingle();

  const dateLocale = locale === "en" ? "en-GB" : "ar-SA";

  const okMsg =
    sp.saved && sp.saved !== "odoo" ? t(`integrations.notices.${sp.saved}`) : null;
  const errMsg = sp.err
    ? (() => {
        const p = `integrations.errors.${sp.err}`;
        const m = t(p);
        return m === p ? t("integrations.errors.generic") : m;
      })()
    : null;
  const odooJustLinked = sp.saved === "odoo";
  const odooErrCode = sp.err?.startsWith("odoo") ? sp.err : null;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("integrations.title")}</h1>
          <p className="text-muted-foreground mt-1 max-w-xl text-sm leading-relaxed">
            {t("integrations.subtitle")}
          </p>
        </div>
        <Link
          prefetch={false}
          href="/dashboard/ai-agent"
          className={cn(buttonVariants({ variant: "outline" }), "shrink-0")}
        >
          {t("integrations.aiSpace")}
        </Link>
      </div>

      {okMsg ? (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
          {okMsg}
        </p>
      ) : null}
      {errMsg && !odooErrCode ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errMsg}
        </p>
      ) : null}

      {!showOdoo && !showEmail ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-sm text-amber-950 dark:text-amber-100">
          <p className="leading-relaxed">
            {session.isSuperAdmin
              ? t("integrations.noToolsSuper")
              : t("integrations.noToolsStaff")}
          </p>
          {session.isSuperAdmin ? (
            <p className="mt-2">
              <Link
                href="/dashboard/ai-governance"
                className={cn(buttonVariants({ variant: "default", size: "sm" }), "inline-flex")}
              >
                {t("integrations.governanceLink")}
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}

      {showOdoo && companyOdoo ? (
        <>
          {session.isSuperAdmin ? (
            <OdooCompanyAdminSection company={companyOdoo} dateLocale={dateLocale} t={t} />
          ) : null}
          <OdooUserLinkCard
            company={companyOdoo}
            odoo={odoo}
            lastSyncAt={odooLastSyncAt}
            dateLocale={dateLocale}
            errorCode={odooErrCode}
            errorMessage={odooErrCode ? errMsg : null}
            justLinked={odooJustLinked}
            t={t}
          />
        </>
      ) : null}

      {showEmail ? (
        <Card className="border-sky-500/20 shadow-sm ring-1 ring-sky-500/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="inline-flex size-2 rounded-full bg-sky-500 shadow-[0_0_12px_rgba(14,165,233,0.8)]" />
              {t("integrations.email.title")}
            </CardTitle>
            <CardDescription>
              {t("integrations.email.desc")}
              {email ? (
                <span className="mt-1 block text-xs text-muted-foreground">
                  {t("integrations.email.updated")}:{" "}
                  {new Date(email.updated_at).toLocaleString(dateLocale)}
                </span>
              ) : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-lg border border-border/80 bg-muted/20 p-4">
              <p className="mb-3 text-xs font-medium text-muted-foreground">
                {t("integrations.email.imapBlock")}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="imap_host">{t("integrations.email.imapHost")}</Label>
                  <Input
                    id="imap_host"
                    name="imap_host"
                    form="integrations-email-form"
                    required
                    dir="ltr"
                    className="font-mono text-sm"
                    defaultValue={email?.imap_host ?? ""}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="imap_port">{t("integrations.email.port")}</Label>
                  <Input
                    id="imap_port"
                    name="imap_port"
                    form="integrations-email-form"
                    type="number"
                    dir="ltr"
                    defaultValue={email?.imap_port ?? 993}
                  />
                </div>
                <div className="flex items-end gap-2 pb-2">
                  <input
                    id="imap_use_tls"
                    name="imap_use_tls"
                    form="integrations-email-form"
                    type="checkbox"
                    defaultChecked={email?.imap_use_tls ?? true}
                    className="size-4 rounded border"
                  />
                  <Label htmlFor="imap_use_tls" className="font-normal">
                    {t("integrations.email.tls")}
                  </Label>
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="imap_username">{t("integrations.email.imapUser")}</Label>
                  <Input
                    id="imap_username"
                    name="imap_username"
                    form="integrations-email-form"
                    required
                    dir="ltr"
                    className="font-mono text-sm"
                    defaultValue={email?.imap_username ?? ""}
                  />
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="imap_password">{t("integrations.email.imapPass")}</Label>
                  <Input
                    id="imap_password"
                    name="imap_password"
                    form="integrations-email-form"
                    type="password"
                    dir="ltr"
                    className="font-mono text-sm"
                    placeholder={
                      email ? t("integrations.email.passKeep") : t("integrations.email.passRequired")
                    }
                    autoComplete="new-password"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border/80 bg-muted/20 p-4">
              <p className="mb-3 text-xs font-medium text-muted-foreground">
                {t("integrations.email.smtpBlock")}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="smtp_host">{t("integrations.email.smtpHost")}</Label>
                  <Input
                    id="smtp_host"
                    name="smtp_host"
                    form="integrations-email-form"
                    required
                    dir="ltr"
                    className="font-mono text-sm"
                    defaultValue={email?.smtp_host ?? ""}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="smtp_port">{t("integrations.email.port")}</Label>
                  <Input
                    id="smtp_port"
                    name="smtp_port"
                    form="integrations-email-form"
                    type="number"
                    dir="ltr"
                    defaultValue={email?.smtp_port ?? 465}
                  />
                </div>
                <div className="flex items-end gap-2 pb-2">
                  <input
                    id="smtp_use_tls"
                    name="smtp_use_tls"
                    form="integrations-email-form"
                    type="checkbox"
                    defaultChecked={email?.smtp_use_tls ?? true}
                    className="size-4 rounded border"
                  />
                  <Label htmlFor="smtp_use_tls" className="font-normal">
                    {t("integrations.email.tls")}
                  </Label>
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="smtp_username">{t("integrations.email.smtpUser")}</Label>
                  <Input
                    id="smtp_username"
                    name="smtp_username"
                    form="integrations-email-form"
                    required
                    dir="ltr"
                    className="font-mono text-sm"
                    defaultValue={email?.smtp_username ?? ""}
                  />
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="smtp_password">{t("integrations.email.smtpPass")}</Label>
                  <Input
                    id="smtp_password"
                    name="smtp_password"
                    form="integrations-email-form"
                    type="password"
                    dir="ltr"
                    className="font-mono text-sm"
                    placeholder={
                      email ? t("integrations.email.passKeep") : t("integrations.email.passRequired")
                    }
                    autoComplete="new-password"
                  />
                </div>
              </div>
            </div>

            <form id="integrations-email-form" action={saveEmailCredentialsAction} className="flex flex-wrap gap-2">
              <PendingSubmitButton
                label={t("integrations.email.save")}
                pendingLabel="Saving..."
              />
              <EmailConnectionTestButton
                formId="integrations-email-form"
                testLabel={t("integrations.testConnection")}
                formMissingMessage={t("integrations.formMissingEmail")}
              />
            </form>
            {email ? (
              <form action={deleteEmailCredentialsAction}>
                <div className="inline-flex">
                  <PendingSubmitButton
                    label={t("integrations.email.delete")}
                    pendingLabel="Deleting..."
                    variant="ghost"
                  />
                </div>
              </form>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <p className="text-muted-foreground text-center text-[11px] leading-relaxed">
        {t("integrations.footerNote")}
      </p>
    </div>
  );
}
