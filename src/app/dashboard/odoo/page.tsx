import { OdooCommandCenterView } from "@/app/dashboard/odoo/odoo-command-center-view";
import { requireSession } from "@/lib/dashboard-auth";
import { loadOdooCommandMetrics } from "@/lib/command-center/odoo-metrics";
import { getLicensedActiveToolSlugs } from "@/lib/ai-tools/user-licenses";
import { getTranslator } from "@/lib/i18n/get-translator";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const maxDuration = 120;

export default async function OdooCommandCenterPage() {
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

  const metrics = await loadOdooCommandMetrics(supabase, session.id);

  return <OdooCommandCenterView metrics={metrics} locale={locale} t={t} />;
}
