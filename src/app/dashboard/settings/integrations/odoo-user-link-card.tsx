import {
  deleteOdooCredentialsAction,
  saveOdooCredentialsAction,
} from "@/app/dashboard/settings/integrations/actions";
import {
  OdooConnectionTestButton,
  PendingSubmitButton,
} from "@/app/dashboard/settings/integrations/integrations-connection-test";
import { OdooBrowserOpenLink } from "@/app/dashboard/settings/integrations/odoo-browser-open-link";
import type { CompanyOdooSettings } from "@/lib/integrations/company-odoo-settings";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function OdooUserLinkCard({
  company,
  odoo,
  dateLocale,
  t,
}: {
  company: CompanyOdooSettings;
  odoo: {
    login_username: string;
    updated_at: string;
  } | null;
  dateLocale: string;
  t: (key: string) => string;
}) {
  const globalReady = Boolean(company.baseUrl);

  return (
    <Card className="border-violet-500/20 shadow-sm ring-1 ring-violet-500/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="inline-flex size-2 rounded-full bg-violet-500 shadow-[0_0_12px_rgba(139,92,246,0.8)]" />
          {t("integrations.odoo.linkTitle")}
        </CardTitle>
        <CardDescription>
          {t("integrations.odoo.linkDesc")}
          {odoo ? (
            <span className="mt-1 block text-xs text-muted-foreground">
              {t("integrations.odoo.updated")}:{" "}
              {new Date(odoo.updated_at).toLocaleString(dateLocale)}
            </span>
          ) : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!globalReady ? (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
            {t("integrations.odoo.waitingAdmin")}
          </p>
        ) : (
          <>
            <p className="text-muted-foreground rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs leading-relaxed">
              {t("integrations.odoo.companyUrlHint")}{" "}
              <span className="font-mono text-foreground" dir="ltr">
                {company.baseUrl}
              </span>
            </p>
            <form id="integrations-odoo-form" action={saveOdooCredentialsAction} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="login_username">{t("integrations.odoo.usernameSimple")}</Label>
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
              <div className="grid gap-2">
                <Label htmlFor="password">{t("integrations.odoo.passwordSimple")}</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  dir="ltr"
                  className="font-mono text-sm"
                  placeholder={
                    odoo ? t("integrations.odoo.passwordKeep") : t("integrations.odoo.passwordRequired")
                  }
                  autoComplete="current-password"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <PendingSubmitButton
                  label={t("integrations.odoo.saveSimple")}
                  pendingLabel={t("integrations.odoo.saving")}
                />
                <OdooConnectionTestButton
                  formId="integrations-odoo-form"
                  testLabel={t("integrations.odoo.testSimple")}
                  formMissingMessage={t("integrations.formMissingOdoo")}
                />
                <OdooBrowserOpenLink baseUrl={company.baseUrl} label={t("integrations.odoo.openBrowser")} />
              </div>
            </form>
            {odoo ? (
              <form action={deleteOdooCredentialsAction}>
                <PendingSubmitButton
                  label={t("integrations.odoo.delete")}
                  pendingLabel={t("integrations.odoo.saving")}
                  variant="ghost"
                />
              </form>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
