"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ExternalLinkIcon,
  KeyRoundIcon,
  Link2OffIcon,
  RefreshCwIcon,
  SparklesIcon,
  UserIcon,
} from "lucide-react";

import {
  deleteOdooCredentialsAction,
  saveOdooCredentialsAction,
} from "@/app/dashboard/settings/integrations/actions";
import {
  OdooConnectionTestButton,
  OdooSavedConnectionTestButton,
  PendingSubmitButton,
} from "@/app/dashboard/settings/integrations/integrations-connection-test";
import { OdooBrowserOpenLink } from "@/app/dashboard/settings/integrations/odoo-browser-open-link";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deriveOdooLinkViewModel,
  type OdooLinkRecord,
} from "@/lib/integrations/odoo-link-state";
import { cn } from "@/lib/utils";

type Props = {
  companyBaseUrl: string;
  link: OdooLinkRecord | null;
  lastSyncAt: string | null;
  dateLocale: string;
  errorCode: string | null;
  errorMessage: string | null;
  justLinked: boolean;
  t: (key: string) => string;
};

function formatDt(iso: string | null, locale: string) {
  if (!iso) return null;
  return new Date(iso).toLocaleString(locale === "en" ? "en-GB" : "ar-SA");
}

export function OdooUserLinkClient({
  companyBaseUrl,
  link,
  lastSyncAt,
  dateLocale,
  errorCode,
  errorMessage,
  justLinked,
  t,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [inlineTestError, setInlineTestError] = useState<string | null>(null);
  const [lastTestOkAt, setLastTestOkAt] = useState<string | null>(null);

  const view = useMemo(
    () =>
      deriveOdooLinkViewModel({
        companyBaseUrl,
        link,
        errorCode,
        errorMessage,
        justLinked,
        inlineTestError,
      }),
    [companyBaseUrl, link, errorCode, errorMessage, justLinked, inlineTestError]
  );

  const onTestResult = useCallback((res: { ok: boolean; message: string }) => {
    if (res.ok) {
      setInlineTestError(null);
      setLastTestOkAt(new Date().toISOString());
    } else {
      setInlineTestError(res.message);
    }
  }, []);

  const showSetupForm =
    (!view.link && (view.state === "not_connected" || view.state === "connection_error")) ||
    editing;

  const cardTone =
    view.state === "connected" && !editing
      ? "border-emerald-500/35 shadow-sm ring-1 ring-emerald-500/20"
      : view.state === "reconnect_needed"
        ? "border-amber-500/35 shadow-sm ring-1 ring-amber-500/20"
        : "border-violet-500/20 shadow-sm ring-1 ring-violet-500/10";

  const statusDot =
    view.state === "connected" && !editing
      ? "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.85)]"
      : view.state === "reconnect_needed"
        ? "bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.85)]"
        : "bg-violet-500 shadow-[0_0_12px_rgba(139,92,246,0.8)]";

  return (
    <Card className={cardTone}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <span className={cn("inline-flex size-2 rounded-full", statusDot)} />
              {view.state === "connected" && !editing
                ? t("integrations.odoo.connectedTitle")
                : t("integrations.odoo.linkTitle")}
            </CardTitle>
            <CardDescription>
              {view.state === "connected" && !editing
                ? t("integrations.odoo.connectedDesc")
                : t("integrations.odoo.linkDesc")}
            </CardDescription>
          </div>
          {view.state === "connected" && !editing ? (
            <Badge
              className="border-emerald-500/30 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
              variant="outline"
            >
              <CheckCircle2Icon data-icon="inline-start" />
              {t("integrations.odoo.statusConnected")}
            </Badge>
          ) : null}
          {view.state === "reconnect_needed" && !editing ? (
            <Badge
              className="border-amber-500/30 bg-amber-500/15 text-amber-900 dark:text-amber-100"
              variant="outline"
            >
              <AlertCircleIcon data-icon="inline-start" />
              {t("integrations.odoo.statusReconnect")}
            </Badge>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {view.state === "admin_missing" ? (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
            {t("integrations.odoo.waitingAdmin")}
          </p>
        ) : null}

        {view.state !== "admin_missing" && view.justLinked && !editing ? (
          <div className="flex gap-3 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-950 dark:text-emerald-100">
            <SparklesIcon className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            <div>
              <p className="font-medium">{t("integrations.odoo.justLinkedTitle")}</p>
              <p className="mt-0.5 text-xs leading-relaxed opacity-90">
                {t("integrations.odoo.justLinkedDesc")}
              </p>
            </div>
          </div>
        ) : null}

        {view.errorMessage && view.state !== "admin_missing" ? (
          <div
            className={cn(
              "flex gap-3 rounded-lg border px-4 py-3 text-sm",
              view.state === "reconnect_needed"
                ? "border-amber-500/35 bg-amber-500/10 text-amber-950 dark:text-amber-100"
                : "border-destructive/35 bg-destructive/10 text-destructive"
            )}
          >
            <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">
                {view.state === "reconnect_needed"
                  ? t("integrations.odoo.reconnectTitle")
                  : t("integrations.odoo.errorTitle")}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed opacity-90">{view.errorMessage}</p>
            </div>
          </div>
        ) : null}

        {view.state === "reconnect_needed" && !editing ? (
          <div className="flex justify-end">
            <Button type="button" onClick={() => setEditing(true)}>
              <KeyRoundIcon className="size-4" />
              {t("integrations.odoo.updateLink")}
            </Button>
          </div>
        ) : null}

        {view.link && !editing && view.state !== "admin_missing" ? (
          <ConnectedSummary
            companyBaseUrl={companyBaseUrl}
            link={view.link}
            lastSyncAt={lastSyncAt}
            lastTestOkAt={lastTestOkAt}
            dateLocale={dateLocale}
            t={t}
          />
        ) : null}

        {view.state !== "admin_missing" && showSetupForm ? (
          <div
            className={cn(
              "space-y-4",
              view.link && editing ? "rounded-lg border border-border/70 bg-muted/15 p-4" : null
            )}
          >
            {editing ? (
              <p className="text-sm font-medium">{t("integrations.odoo.editTitle")}</p>
            ) : null}
            {!view.link ? (
              <p className="text-muted-foreground rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs leading-relaxed">
                {t("integrations.odoo.companyUrlHint")}{" "}
                <span className="font-mono text-foreground" dir="ltr">
                  {companyBaseUrl}
                </span>
              </p>
            ) : null}
            <form id="integrations-odoo-form" action={saveOdooCredentialsAction} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="login_username">{t("integrations.odoo.usernameSimple")}</Label>
                <Input
                  id="login_username"
                  name="login_username"
                  required
                  dir="ltr"
                  className="font-mono text-sm"
                  defaultValue={link?.login_username ?? ""}
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
                    link ? t("integrations.odoo.passwordKeep") : t("integrations.odoo.passwordRequired")
                  }
                  autoComplete="current-password"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <PendingSubmitButton
                  label={editing ? t("integrations.odoo.saveUpdate") : t("integrations.odoo.saveSimple")}
                  pendingLabel={t("integrations.odoo.saving")}
                />
                <OdooConnectionTestButton
                  formId="integrations-odoo-form"
                  testLabel={t("integrations.odoo.testSimple")}
                  formMissingMessage={t("integrations.formMissingOdoo")}
                  onResult={onTestResult}
                />
                {editing ? (
                  <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                    {t("integrations.odoo.cancelEdit")}
                  </Button>
                ) : null}
              </div>
            </form>
          </div>
        ) : null}

        {view.link && !editing && view.state !== "admin_missing" ? (
          <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
            <OdooSavedConnectionTestButton
              loginUsername={view.link.login_username}
              testLabel={t("integrations.odoo.testSimple")}
              onResult={onTestResult}
            />
            <OdooBrowserOpenLink baseUrl={companyBaseUrl} label={t("integrations.odoo.openBrowser")} />
            <Link
              href="/dashboard/ai-agent"
              className={cn(buttonVariants({ variant: "default" }), "h-8")}
            >
              {t("integrations.odoo.openTasks")}
            </Link>
            <Button type="button" variant="outline" onClick={() => setEditing(true)}>
              <KeyRoundIcon className="size-4" />
              {t("integrations.odoo.updateLink")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => setDisconnectOpen(true)}
            >
              <Link2OffIcon className="size-4" />
              {t("integrations.odoo.disconnect")}
            </Button>
          </div>
        ) : null}

        <Dialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
          <DialogContent showCloseButton>
            <DialogHeader>
              <DialogTitle>{t("integrations.odoo.disconnectTitle")}</DialogTitle>
              <DialogDescription>{t("integrations.odoo.disconnectDesc")}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDisconnectOpen(false)}>
                {t("integrations.odoo.disconnectCancel")}
              </Button>
              <form action={deleteOdooCredentialsAction}>
                <PendingSubmitButton
                  label={t("integrations.odoo.disconnectConfirm")}
                  pendingLabel={t("integrations.odoo.saving")}
                  variant="destructive"
                />
              </form>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function ConnectedSummary({
  companyBaseUrl,
  link,
  lastSyncAt,
  lastTestOkAt,
  dateLocale,
  t,
}: {
  companyBaseUrl: string;
  link: OdooLinkRecord;
  lastSyncAt: string | null;
  lastTestOkAt: string | null;
  dateLocale: string;
  t: (key: string) => string;
}) {
  const rows = [
    {
      icon: UserIcon,
      label: t("integrations.odoo.summaryAccount"),
      value: link.login_username,
    },
    {
      icon: ExternalLinkIcon,
      label: t("integrations.odoo.summaryServer"),
      value: companyBaseUrl,
      mono: true,
    },
    {
      icon: KeyRoundIcon,
      label: t("integrations.odoo.summaryPassword"),
      value: t("integrations.odoo.passwordSecured"),
    },
    {
      icon: RefreshCwIcon,
      label: t("integrations.odoo.summaryLinked"),
      value: formatDt(link.updated_at, dateLocale) ?? "—",
    },
    {
      icon: RefreshCwIcon,
      label: t("integrations.odoo.summarySync"),
      value: formatDt(lastSyncAt, dateLocale) ?? t("integrations.odoo.neverSynced"),
    },
  ];

  if (lastTestOkAt) {
    rows.push({
      icon: CheckCircle2Icon,
      label: t("integrations.odoo.summaryLastTest"),
      value: formatDt(lastTestOkAt, dateLocale) ?? "—",
    });
  }

  return (
    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
      <p className="mb-3 text-sm font-medium text-emerald-900 dark:text-emerald-100">
        {t("integrations.odoo.connectedReady")}
      </p>
      <dl className="grid gap-2.5">
        {rows.map((row) => (
          <div key={row.label} className="flex gap-3 text-sm">
            <row.icon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <dt className="text-muted-foreground text-xs">{row.label}</dt>
              <dd
                className={cn("truncate font-medium", row.mono ? "font-mono text-xs" : "")}
                dir={row.mono ? "ltr" : undefined}
              >
                {row.value}
              </dd>
            </div>
          </div>
        ))}
      </dl>
    </div>
  );
}
