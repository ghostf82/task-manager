import Link from "next/link";

import {
  buildEmailCenterLabels,
  EmailIntelligenceCenterView,
} from "@/app/dashboard/email/email-intelligence-center-view";
import { buttonVariants } from "@/components/ui/button";
import { requireSession } from "@/lib/dashboard-auth";
import { loadEmailCommandMetrics } from "@/lib/command-center/email-intelligence";
import { getLicensedActiveToolSlugs } from "@/lib/ai-tools/user-licenses";
import { getTranslator } from "@/lib/i18n/get-translator";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const maxDuration = 120;

export default async function EmailIntelligenceCenterPage() {
  const session = await requireSession();
  const { t, locale } = await getTranslator();
  const supabase = await createClient();
  const licensed = await getLicensedActiveToolSlugs(supabase, session.id);

  if (!licensed.includes("email")) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-12 text-center">
        <h1 className="text-2xl font-semibold">{t("commandCenter.email.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("commandCenter.email.noLicense")}</p>
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

  const metrics = await loadEmailCommandMetrics(supabase, session.id);
  const labels = buildEmailCenterLabels(t);

  return <EmailIntelligenceCenterView metrics={metrics} locale={locale} labels={labels} />;
}
