import { ExecutiveBriefingView } from "@/components/executive-intelligence/executive-briefing-view";
import { buildExecutiveLabels } from "@/lib/executive-intelligence/briefing-labels";
import { loadExecutiveMorningBrief } from "@/lib/executive-intelligence/load-executive-briefing";
import { requireSession } from "@/lib/dashboard-auth";
import { getTranslator } from "@/lib/i18n/get-translator";
import {
  emptyIsolatedBrief,
  isolatedLoopbackEnabledNow,
} from "@/lib/sso/isolated-loopback";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 120;

export default async function DashboardHomePage() {
  const session = await requireSession();
  const { t, locale } = await getTranslator();
  if (await isolatedLoopbackEnabledNow()) {
    return (
      <ExecutiveBriefingView
        brief={emptyIsolatedBrief()}
        labels={buildExecutiveLabels(t)}
        tr={t}
        locale={locale}
      />
    );
  }
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("users")
    .select("is_super_admin")
    .eq("id", session.id)
    .single();

  const brief = await loadExecutiveMorningBrief(supabase, session.id, Boolean(profile?.is_super_admin));
  const labels = buildExecutiveLabels(t);

  return <ExecutiveBriefingView brief={brief} labels={labels} tr={t} locale={locale} />;
}
