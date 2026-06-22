import { NextResponse } from "next/server";

import { loadOdooOperationalBrief } from "@/lib/command-center/odoo-operational-brief";
import { loadOdooWorkspaceCache } from "@/lib/command-center/load-odoo-workspace-cache";
import { buildOdooWorkspaceExcelBuffer } from "@/lib/reports/excel-odoo-workspace";
import type { OdooProjectEnrichedRow } from "@/lib/integrations/odoo-project-enrich";
import type { OdooTaskUiRow } from "@/lib/integrations/odoo-task-ui-types";
import { createRouteSupabaseClient } from "@/lib/supabase/route-handler";

export const maxDuration = 120;

export async function GET() {
  const supabase = await createRouteSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("is_super_admin")
    .eq("id", user.id)
    .single();

  const [brief, cache] = await Promise.all([
    loadOdooOperationalBrief(supabase, user.id, Boolean(profile?.is_super_admin)),
    loadOdooWorkspaceCache(supabase, user.id),
  ]);

  if (!brief.connected) return new NextResponse("Odoo not linked", { status: 400 });

  const ws = cache.initialWorkspace;
  const tasks = Array.isArray(ws?.tasks) ? (ws.tasks as OdooTaskUiRow[]) : [];
  const projects = Array.isArray(ws?.projects) ? (ws.projects as OdooProjectEnrichedRow[]) : [];
  const events = Array.isArray(ws?.events)
    ? (ws.events as Array<{ id: number; name: string; start: string; stop: string; responsible: string }>)
    : [];

  const buf = await buildOdooWorkspaceExcelBuffer({
    brief,
    tasks,
    projects,
    events,
    generatedAt: new Date().toLocaleString("ar-SA"),
    title: "Odoo Workspace Export",
  });

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="odoo-workspace-${date}.xlsx"`,
    },
  });
}
