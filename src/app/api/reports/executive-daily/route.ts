import { NextResponse } from "next/server";

import { loadExecutiveMorningBrief } from "@/lib/executive-intelligence/load-executive-briefing";
import { buildOdooOperationalPdfBuffer } from "@/lib/reports/pdf-odoo-operational";
import { loadOdooOperationalBrief } from "@/lib/command-center/odoo-operational-brief";
import { createRouteSupabaseClient } from "@/lib/supabase/route-handler";

export async function GET() {
  const supabase = await createRouteSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { data: profile } = await supabase.from("users").select("is_super_admin").eq("id", user.id).single();
  const isSuperAdmin = Boolean(profile?.is_super_admin);

  const [brief, odooBrief] = await Promise.all([
    loadExecutiveMorningBrief(supabase, user.id, isSuperAdmin),
    loadOdooOperationalBrief(supabase, user.id, isSuperAdmin).catch(() => null),
  ]);

  const title = `Executive Daily Brief — ${brief.counts.actionToday} actions today`;
  const buf = odooBrief?.connected
    ? await buildOdooOperationalPdfBuffer(odooBrief, {
        title,
        generatedAt: new Date().toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" }),
      })
    : await buildOdooOperationalPdfBuffer(
        {
          connected: true,
          baseUrl: "",
          loginUsername: null,
          lastSyncAt: brief.generatedAt,
          health: brief.health,
          attentionToday: brief.counts.actionToday,
          attentionCritical: brief.counts.criticalRisks,
          attentionQueue: [],
          insights: [],
          complianceItems: [],
          workload: [],
          counts: {
            overdueTasks: brief.counts.overdueCorporate,
            dueTodayTasks: brief.counts.actionToday,
            due7Days: 0,
            due30Days: 0,
            due90Days: 0,
            unassignedTasks: 0,
            stalledProjects: 0,
            complianceExpiring90: 0,
            complianceOverdue: brief.counts.complianceCritical,
            complianceWarning: 0,
            eventsToday: brief.counts.eventsToday,
            highPriorityTasks: 0,
            openTasks: 0,
            activeProjects: 0,
          },
          topExposedTenant: brief.warRooms[0]?.name ?? null,
          syncStale: false,
        },
        { title, generatedAt: brief.generatedAt }
      );

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="executive-daily-brief-${date}.pdf"`,
    },
  });
}
