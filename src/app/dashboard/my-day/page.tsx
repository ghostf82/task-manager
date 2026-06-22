import { MyDayView } from "@/components/executive-intelligence/my-day-view";
import { buildExecutiveLabels } from "@/lib/executive-intelligence/briefing-labels";
import { loadMyDayItems } from "@/lib/executive-intelligence/load-executive-briefing";
import { requireSession } from "@/lib/dashboard-auth";
import { getTranslator } from "@/lib/i18n/get-translator";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 120;

export default async function MyDayPage() {
  const session = await requireSession();
  const { t } = await getTranslator();
  const supabase = await createClient();
  const { data: profile } = await supabase.from("users").select("is_super_admin").eq("id", session.id).single();
  const items = await loadMyDayItems(supabase, session.id, Boolean(profile?.is_super_admin));
  const labels = buildExecutiveLabels(t);
  return <MyDayView items={items} labels={labels} tr={t} />;
}
