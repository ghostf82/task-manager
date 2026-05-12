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
import { NotificationsMenu } from "@/components/dashboard/notifications-menu";
import { requireSession } from "@/lib/dashboard-auth";
import { DASHBOARD_NAV_LINKS } from "@/lib/i18n/nav-config";
import { getTranslator } from "@/lib/i18n/get-translator";

/** Netlify / serverless: allow long-running dashboard server actions (Odoo sync, calendar clone). */
export const maxDuration = 120;

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const supabase = await createClient();
  const [{ t, locale, catalog }, profileRes, membershipRes, notifsRes] = await Promise.all([
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
  ]);
  const profile = profileRes.data;
  const membership = membershipRes.data;
  const notifs = notifsRes.data;

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
    copyright: t("footer.tagline"),
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
            </div>
            <div className="flex items-center gap-2">
              <NotificationsMenu
                initialItems={notifs ?? []}
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
