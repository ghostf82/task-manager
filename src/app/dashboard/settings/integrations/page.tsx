import Link from "next/link";

import {
  deleteEmailCredentialsAction,
  deleteOdooCredentialsAction,
  saveEmailCredentialsAction,
  saveOdooCredentialsAction,
} from "@/app/dashboard/settings/integrations/actions";
import {
  EmailConnectionTestButton,
  OdooConnectionTestButton,
  PendingSubmitButton,
} from "@/app/dashboard/settings/integrations/integrations-connection-test";
import { FormSubmitGuard } from "@/app/dashboard/settings/integrations/form-submit-guard";
import { OdooBrowserOpenLink } from "@/app/dashboard/settings/integrations/odoo-browser-open-link";
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

  const { data: odoo } = await supabase
    .from("user_odoo_credentials")
    .select("base_url, database_name, login_username, updated_at")
    .eq("user_id", session.id)
    .maybeSingle();
  const isOdooBrowserMode = odoo?.database_name === "__browser_session__";

  const { data: email } = await supabase
    .from("user_email_credentials")
    .select(
      "imap_host, imap_port, imap_use_tls, imap_username, smtp_host, smtp_port, smtp_use_tls, smtp_username, updated_at",
    )
    .eq("user_id", session.id)
    .maybeSingle();

  const dateLocale = locale === "en" ? "en-GB" : "ar-SA";

  const okMsg = sp.saved ? t(`integrations.notices.${sp.saved}`) : null;
  const errMsg = sp.err
    ? (() => {
        const p = `integrations.errors.${sp.err}`;
        const m = t(p);
        return m === p ? t("integrations.errors.generic") : m;
      })()
    : null;

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
      {errMsg ? (
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

      {showOdoo ? (
        <Card className="border-violet-500/20 shadow-sm ring-1 ring-violet-500/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="inline-flex size-2 rounded-full bg-violet-500 shadow-[0_0_12px_rgba(139,92,246,0.8)]" />
              {t("integrations.odoo.title")}
            </CardTitle>
            <CardDescription>
              {t("integrations.odoo.desc")}
              {odoo ? (
                <span className="mt-1 block text-xs text-muted-foreground">
                  {t("integrations.odoo.updated")}:{" "}
                  {new Date(odoo.updated_at).toLocaleString(dateLocale)}
                </span>
              ) : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form id="integrations-odoo-form" action={saveOdooCredentialsAction} className="grid gap-4">
              <FormSubmitGuard formId="integrations-odoo-form" />
              <input
                type="hidden"
                name="connection_mode"
                value={isOdooBrowserMode ? "browser_session" : "api"}
              />
              {isOdooBrowserMode ? (
                <p className="rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-800 dark:text-blue-200">
                  Browser Session Mode مفعل: الربط يعتمد على جلسة المتصفح بعد تسجيل دخولك في Odoo.
                </p>
              ) : null}
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="base_url">{t("integrations.odoo.baseUrl")}</Label>
                  <Input
                    id="base_url"
                    name="base_url"
                    required
                    dir="ltr"
                    className="font-mono text-sm"
                    placeholder="https://odoo.example.com"
                    defaultValue={odoo?.base_url ?? ""}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="database_name">{t("integrations.odoo.dbName")}</Label>
                  <Input
                    id="database_name"
                    name="database_name"
                    dir="ltr"
                    className="font-mono text-sm"
                    placeholder="production (اختياري)"
                    defaultValue={odoo?.database_name ?? ""}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="login_username">{t("integrations.odoo.username")}</Label>
                  <Input
                    id="login_username"
                    name="login_username"
                    required
                    dir="ltr"
                    className="font-mono text-sm"
                    defaultValue={odoo?.login_username ?? ""}
                    autoComplete="username"
                  />
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="password">{t("integrations.odoo.password")}</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    dir="ltr"
                    className="font-mono text-sm"
                    placeholder={
                      isOdooBrowserMode
                        ? "يوصى بإدخال كلمة المرور/مفتاح API لتفعيل قراءة المهام عبر الجلسة"
                        : (odoo ? t("integrations.odoo.passwordKeep") : t("integrations.odoo.passwordRequired"))
                    }
                    autoComplete="current-password"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <PendingSubmitButton
                  label={t("integrations.odoo.save")}
                  pendingLabel="جارٍ الحفظ..."
                />
                <OdooConnectionTestButton
                  formId="integrations-odoo-form"
                  testLabel={t("integrations.testConnection")}
                  formMissingMessage={t("integrations.formMissingOdoo")}
                />
                <OdooBrowserOpenLink baseUrl={odoo?.base_url ?? ""} label="فتح Odoo بالمتصفح" />
              </div>
            </form>
            {!isOdooBrowserMode ? (
              <form action={saveOdooCredentialsAction} className="pt-1">
                <input type="hidden" name="base_url" value={odoo?.base_url ?? ""} />
                <input type="hidden" name="connection_mode" value="browser_session" />
                <PendingSubmitButton label="تفعيل Browser Session Mode" pendingLabel="جارٍ التفعيل..." variant="outline" />
              </form>
            ) : (
              <form action={saveOdooCredentialsAction} className="pt-1 grid gap-2 sm:grid-cols-[1fr_auto]">
                <input type="hidden" name="connection_mode" value="api" />
                <Input name="base_url" dir="ltr" className="font-mono text-sm" defaultValue={odoo?.base_url ?? ""} />
                <PendingSubmitButton label="الرجوع إلى API Mode" pendingLabel="جارٍ التفعيل..." variant="outline" />
              </form>
            )}
            {odoo ? (
              <form action={deleteOdooCredentialsAction}>
                <div className="inline-flex">
                  <PendingSubmitButton
                    label={t("integrations.odoo.delete")}
                    pendingLabel="جارٍ الحذف..."
                    variant="ghost"
                  />
                </div>
              </form>
            ) : null}
          </CardContent>
        </Card>
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
            <form id="integrations-email-form" action={saveEmailCredentialsAction} className="grid gap-6">
              <FormSubmitGuard formId="integrations-email-form" />
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
                      type="number"
                      dir="ltr"
                      defaultValue={email?.imap_port ?? 993}
                    />
                  </div>
                  <div className="flex items-end gap-2 pb-2">
                    <input
                      id="imap_use_tls"
                      name="imap_use_tls"
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
                      type="number"
                      dir="ltr"
                      defaultValue={email?.smtp_port ?? 465}
                    />
                  </div>
                  <div className="flex items-end gap-2 pb-2">
                    <input
                      id="smtp_use_tls"
                      name="smtp_use_tls"
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

              <div className="flex flex-wrap gap-2">
                <PendingSubmitButton
                  label={t("integrations.email.save")}
                  pendingLabel="Saving..."
                />
                <EmailConnectionTestButton
                  formId="integrations-email-form"
                  testLabel={t("integrations.testConnection")}
                  formMissingMessage={t("integrations.formMissingEmail")}
                />
              </div>
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
