import Link from "next/link";

import { ExecutiveBriefShellDisconnected } from "@/components/command-center/odoo-executive-brief";
import { OdooSmartWorkspaceShell } from "@/app/dashboard/odoo/odoo-smart-workspace-shell";
import { buildOdooBriefLabels } from "@/lib/command-center/odoo-brief-labels";
import { loadOdooWorkspaceCache } from "@/lib/command-center/load-odoo-workspace-cache";
import { loadOdooOperationalBrief } from "@/lib/command-center/odoo-operational-brief";
import { requireSession } from "@/lib/dashboard-auth";
import { getLicensedActiveToolSlugs } from "@/lib/ai-tools/user-licenses";
import { getTranslator } from "@/lib/i18n/get-translator";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const maxDuration = 120;

export default async function OdooWorkspacePage() {
  const session = await requireSession();
  const { t, locale } = await getTranslator();
  const supabase = await createClient();
  const licensed = await getLicensedActiveToolSlugs(supabase, session.id);

  if (!licensed.includes("odoo")) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-12 text-center">
        <h1 className="text-2xl font-semibold">{t("commandCenter.odoo.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("commandCenter.odoo.noLicense")}</p>
        {session.isSuperAdmin ? (
          <Link href="/dashboard/ai-governance" className={cn(buttonVariants({ variant: "default" }))}>
            {t("integrations.governanceLink")}
          </Link>
        ) : (
          <p className="text-muted-foreground text-xs">{t("integrations.noToolsStaff")}</p>
        )}
      </div>
    );
  }

  const [brief, cache] = await Promise.all([
    loadOdooOperationalBrief(supabase, session.id, session.isSuperAdmin),
    loadOdooWorkspaceCache(supabase, session.id),
  ]);
  const labels = buildOdooBriefLabels(t);

  if (!brief.connected) {
    return <ExecutiveBriefShellDisconnected labels={labels} />;
  }

  return (
    <OdooSmartWorkspaceShell
      brief={brief}
      labels={labels}
      locale={locale}
      initialWorkspace={cache.initialWorkspace}
      initialLastSyncAt={cache.lastSyncAt}
      odooBaseUrl={cache.odooBaseUrl}
      loadingLabel={t("common.loading")}
    />
  );
}
