import { Suspense } from "react";
import Link from "next/link";

import { DashboardToasterHost } from "@/components/dashboard/dashboard-toaster-host";
import { DashboardI18nProvider } from "@/contexts/dashboard-i18n";
import { createClient } from "@/lib/supabase/server";
import {
  AppSidebar,
  MobileDashboardNav,
  type DashboardShellClientProps,
} from "@/components/dashboard/app-sidebar";
import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-page-skeleton";
import { HeaderUserMenu } from "@/components/dashboard/header-user-menu";
import {
  NotificationsMenu,
  type NotificationItem,
} from "@/components/dashboard/notifications-menu";
import { requireSession } from "@/lib/dashboard-auth";
import { formatOdooLastSyncLine } from "@/lib/dashboard/format-odoo-last-sync";
import { DASHBOARD_NAV_LINKS } from "@/lib/i18n/nav-config";
import { getTranslator } from "@/lib/i18n/get-translator";

/** Netlify / serverless: allow long-running dashboard server actions (Odoo sync, calendar clone). */
export const maxDuration = 120;

function toIsoString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function serializeNotifications(
  rows: { id: string; title: string | null; body: string | null; created_at: string; read_at: string | null }[] | null,
): NotificationItem[] {
  if (!rows?.length) return [];
  return rows
    .filter((r) => r != null && String(r.id ?? "").length > 0)
    .map((r) => ({
      id: String(r.id),
      title: typeof r.title === "string" ? r.title : r.title == null ? "" : String(r.title),
      body: r.body == null || r.body === "" ? null : String(r.body),
      created_at: toIsoString(r.created_at),
      read_at: r.read_at == null || r.read_at === "" ? null : toIsoString(r.read_at),
    }));
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const supabase = await createClient();
  const [{ t, locale, catalog }, profileRes, membershipRes, notifsRes, odooSyncRes] = await Promise.all([
    getTranslator(),
    supabase
      .from("users")
      .select("full_name, email, avatar_url")
      .eq("id", session.id)
      .single(),
    supabase
      .from("tenant_memberships")
      .select("job_title, tenants(name)")
      .eq("user_id", session.id)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("notifications")
      .select("id,title,body,created_at,read_at")
      .eq("user_id", session.id)
      .order("created_at", { ascending: false })
      .limit(12),
    supabase.from("odoo_browser_cache").select("updated_at").eq("user_id", session.id),
  ]);
  const profile = profileRes.data;
  const membership = membershipRes.data;
  const notifs = notifsRes.data;
  const odooSyncRows = odooSyncRes.data;
  const odooSyncTimes = (odooSyncRows ?? [])
    .map((r) => Date.parse(String(r.updated_at)))
    .filter((n) => Number.isFinite(n));
  const lastOdooSyncIso = odooSyncTimes.length
    ? new Date(Math.max(...odooSyncTimes)).toISOString()
    : null;
  const odooSyncUi = formatOdooLastSyncLine({
    locale: locale === "en" ? "en" : "ar",
    iso: lastOdooSyncIso,
  });

  const rawT = membership?.tenants;
  const tenantName =
    rawT && typeof rawT === "object"
      ? Array.isArray(rawT)
        ? rawT[0] && typeof rawT[0] === "object" && "name" in rawT[0]
          ? String((rawT[0] as { name: string }).name)
          : null
        : "name" in rawT
          ? String((rawT as { name: string }).name)
          : null
      : null;

  const shell: DashboardShellClientProps = {
    isSuperAdmin: session.isSuperAdmin,
    locale,
    brand: t("dashboard.brand"),
    panelTitle: t("dashboard.panelTitle"),
    mobileNavTitle: t("dashboard.mobileNav"),
    navItems: DASHBOARD_NAV_LINKS.map((l) => ({
      href: l.href,
      label: t(l.labelKey),
      iconKey: l.iconKey,
      superOnly: l.superOnly,
    })),
    lang: {
      label: t("language.label"),
      ar: t("language.ar"),
      en: t("language.en"),
    },
  };

  const headerUser = {
    displayName: profile?.full_name ?? null,
    email: profile?.email ?? session.email ?? null,
    jobTitle: membership?.job_title ?? null,
    tenantLabel: tenantName,
    avatarUrl: profile?.avatar_url ?? null,
    positionLabel: t("profileBar.position"),
    fallbackName: t("profileBar.fallbackName"),
    accountLabel: t("profileBar.account"),
    signOutLabel: t("common.signOut"),
  };

  return (
    <DashboardI18nProvider locale={locale} catalog={catalog}>
      {/* Browser extension console noise (message channel closed / runtime.lastError) is usually unrelated to this app. */}
      <div className="flex min-h-screen flex-col">
        <AppSidebar {...shell} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col md:pe-60">
          <header className="app-glass-header sticky top-0 z-20 mx-3 mt-3 flex h-14 shrink-0 items-center justify-between gap-2 px-3 md:mx-4 md:px-4">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <MobileDashboardNav {...shell} />
              <Link
                prefetch={false}
                href="/dashboard"
                className="truncate text-sm font-bold tracking-tight text-primary"
              >
                {shell.panelTitle}
              </Link>
              {odooSyncUi.text ? (
                <span
                  className={`hidden min-w-0 truncate text-[10px] font-normal leading-tight md:inline md:max-w-[min(100%,14rem)] lg:max-w-[min(100%,22rem)] ${
                    odooSyncUi.stale ? "text-amber-800/90 dark:text-amber-300/90" : "text-muted-foreground"
                  }`}
                  title={odooSyncUi.text}
                >
                  {odooSyncUi.text}
                </span>
              ) : (
                <span className="text-muted-foreground hidden truncate text-[10px] md:inline">
                  {t("dashboard.odooLastSyncNever")}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <NotificationsMenu
                initialItems={serializeNotifications(notifs)}
                label={t("dashboard.notifications")}
              />
              <HeaderUserMenu {...headerUser} />
            </div>
          </header>
          <main className="min-h-0 flex-1 overflow-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:p-6 md:pb-6 lg:p-8 lg:pb-8">
            <Suspense fallback={<DashboardPageSkeleton />}>{children}</Suspense>
          </main>
        </div>
        <DashboardToasterHost />
      </div>
    </DashboardI18nProvider>
  );
}
