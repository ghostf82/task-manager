import {
  loadOdooConnectionsAdminOverview,
  saveCompanyOdooSettingsAction,
  seedCompanyOdooFromMyCredentialsAction,
  type OdooConnectionAdminRow,
} from "@/app/dashboard/settings/integrations/odoo-admin-actions";
import { PendingSubmitButton } from "@/app/dashboard/settings/integrations/integrations-connection-test";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatDt(iso: string | null, locale: string) {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleString(locale === "en" ? "en-GB" : "ar-SA");
}

function modeLabel(mode: OdooConnectionAdminRow["connectionMode"], t: (k: string) => string) {
  if (mode === "browser_session") return t("integrations.odooAdmin.modeBrowser");
  if (mode === "api") return t("integrations.odooAdmin.modeApi");
  return "—";
}

export async function OdooCompanyAdminSection({
  company,
  dateLocale,
  t,
}: {
  company: CompanyOdooSettings;
  dateLocale: string;
  t: (key: string) => string;
}) {
  let rows: OdooConnectionAdminRow[] = [];
  let connectionsLoadFailed = false;
  try {
    rows = await loadOdooConnectionsAdminOverview();
  } catch {
    connectionsLoadFailed = true;
  }

  return (
    <div className="space-y-6">
      <Card className="border-amber-500/25 shadow-sm ring-1 ring-amber-500/10">
        <CardHeader>
          <CardTitle>{t("integrations.odooAdmin.companyTitle")}</CardTitle>
          <CardDescription>{t("integrations.odooAdmin.companyDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={saveCompanyOdooSettingsAction} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="company_base_url">{t("integrations.odooAdmin.baseUrl")}</Label>
              <Input
                id="company_base_url"
                name="base_url"
                required
                dir="ltr"
                className="font-mono text-sm"
                placeholder="https://odoo.example.com"
                defaultValue={company.baseUrl}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="connection_mode">{t("integrations.odooAdmin.connectionMode")}</Label>
                <select
                  id="connection_mode"
                  name="connection_mode"
                  className="h-9 w-full rounded-xl border border-input/80 bg-white/75 px-3 text-sm"
                  defaultValue={company.connectionMode}
                >
                  <option value="browser_session">{t("integrations.odooAdmin.modeBrowser")}</option>
                  <option value="api">{t("integrations.odooAdmin.modeApi")}</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="api_database_name">{t("integrations.odooAdmin.apiDbName")}</Label>
                <Input
                  id="api_database_name"
                  name="api_database_name"
                  dir="ltr"
                  className="font-mono text-sm"
                  placeholder={t("integrations.odooAdmin.apiDbPlaceholder")}
                  defaultValue={company.apiDatabaseName}
                />
              </div>
            </div>
            <p className="text-muted-foreground text-xs leading-relaxed">
              {t("integrations.odooAdmin.modeHint")}
            </p>
            <div className="flex flex-wrap gap-2">
              <PendingSubmitButton
                label={t("integrations.odooAdmin.saveCompany")}
                pendingLabel={t("integrations.odooAdmin.saving")}
              />
            </div>
          </form>
          {!company.baseUrl ? (
            <form action={seedCompanyOdooFromMyCredentialsAction}>
              <PendingSubmitButton
                label={t("integrations.odooAdmin.seedFromMine")}
                pendingLabel={t("integrations.odooAdmin.saving")}
                variant="outline"
              />
            </form>
          ) : null}
          {company.baseUrl && company.updatedAt ? (
            <p className="text-muted-foreground text-xs">
              {t("integrations.odoo.updated")}: {formatDt(company.updatedAt, dateLocale)}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("integrations.odooAdmin.connectionsTitle")}</CardTitle>
          <CardDescription>{t("integrations.odooAdmin.connectionsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {connectionsLoadFailed ? (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
              {t("integrations.odooAdmin.connectionsLoadFailed")}
            </p>
          ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("integrations.odooAdmin.colUser")}</TableHead>
                <TableHead>{t("integrations.odooAdmin.colConnected")}</TableHead>
                <TableHead>{t("integrations.odooAdmin.colUsername")}</TableHead>
                <TableHead>{t("integrations.odooAdmin.colMode")}</TableHead>
                <TableHead>{t("integrations.odooAdmin.colUpdated")}</TableHead>
                <TableHead>{t("integrations.odooAdmin.colSync")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.userId}>
                  <TableCell>
                    <div className="font-medium">{row.fullName || row.email}</div>
                    <div className="text-muted-foreground text-xs">{row.email}</div>
                  </TableCell>
                  <TableCell>{row.connected ? t("integrations.odooAdmin.yes") : t("integrations.odooAdmin.no")}</TableCell>
                  <TableCell className="font-mono text-xs">{row.loginUsername ?? "—"}</TableCell>
                  <TableCell>{modeLabel(row.connectionMode, t)}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {formatDt(row.credentialsUpdatedAt, dateLocale)}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {formatDt(row.lastSyncAt, dateLocale)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
