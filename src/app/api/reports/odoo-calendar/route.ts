import { NextResponse } from "next/server";

import { loadOdooWorkspaceCache } from "@/lib/command-center/load-odoo-workspace-cache";
import { buildOdooOperationalPdfBuffer } from "@/lib/reports/pdf-odoo-operational";
import { loadOdooOperationalBrief } from "@/lib/command-center/odoo-operational-brief";
import { createRouteSupabaseClient } from "@/lib/supabase/route-handler";

export const maxDuration = 120;

/** Calendar slice PDF — operational window events from workspace cache. */
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

  const events = Array.isArray(cache.initialWorkspace?.events)
    ? (cache.initialWorkspace!.events as Array<{ name: string; start: string }>)
    : [];

  const buf = await buildOdooOperationalPdfBuffer(brief, {
    title: `تقرير التقويم — ${events.length} حدث في النافذة التشغيلية`,
    generatedAt: new Date().toLocaleString("ar-SA"),
  });

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="odoo-calendar-${date}.pdf"`,
    },
  });
}
