import Link from "next/link";

import { WarRoomDetailView } from "@/components/executive-intelligence/war-room-view";
import { buildExecutiveLabels } from "@/lib/executive-intelligence/briefing-labels";
import { loadWarRoomDetail } from "@/lib/executive-intelligence/load-executive-briefing";
import { requireSession } from "@/lib/dashboard-auth";
import { getTranslator } from "@/lib/i18n/get-translator";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const maxDuration = 120;

export default async function WarRoomDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await requireSession();
  const { t } = await getTranslator();
  const supabase = await createClient();
  const { data: profile } = await supabase.from("users").select("is_super_admin").eq("id", session.id).single();
  const { snapshot, compliance, myDay } = await loadWarRoomDetail(
    supabase,
    session.id,
    Boolean(profile?.is_super_admin),
    slug
  );

  if (!snapshot) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <p className="text-muted-foreground text-sm">{t("executive.warRoom.notFound")}</p>
        <Link href="/dashboard/war-room" className={cn(buttonVariants({ variant: "default" }), "mt-4")}>
          {t("executive.warRoom.viewAll")}
        </Link>
      </div>
    );
  }

  const labels = buildExecutiveLabels(t);
  return (
    <WarRoomDetailView snapshot={snapshot} compliance={compliance} myDay={myDay} labels={labels} tr={t} />
  );
}
