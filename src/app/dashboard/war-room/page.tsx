import { WarRoomListView } from "@/components/executive-intelligence/war-room-view";
import { buildExecutiveLabels } from "@/lib/executive-intelligence/briefing-labels";
import { loadExecutiveMorningBrief } from "@/lib/executive-intelligence/load-executive-briefing";
import { requireSession } from "@/lib/dashboard-auth";
import { getTranslator } from "@/lib/i18n/get-translator";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 120;

export default async function WarRoomListPage() {
  const session = await requireSession();
  const { t } = await getTranslator();
  const supabase = await createClient();
  const { data: profile } = await supabase.from("users").select("is_super_admin").eq("id", session.id).single();
  const brief = await loadExecutiveMorningBrief(supabase, session.id, Boolean(profile?.is_super_admin));
  const labels = buildExecutiveLabels(t);
  return <WarRoomListView rooms={brief.warRooms} labels={labels} tr={t} />;
}
