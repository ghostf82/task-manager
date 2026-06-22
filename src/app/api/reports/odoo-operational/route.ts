import { NextResponse } from "next/server";

import { loadOdooOperationalBrief } from "@/lib/command-center/odoo-operational-brief";
import { buildOdooOperationalPdfBuffer } from "@/lib/reports/pdf-odoo-operational";
import { createRouteSupabaseClient } from "@/lib/supabase/route-handler";

export async function GET() {
  const supabase = await createRouteSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("is_super_admin")
    .eq("id", user.id)
    .single();

  const brief = await loadOdooOperationalBrief(
    supabase,
    user.id,
    Boolean(profile?.is_super_admin)
  );

  if (!brief.connected) {
    return new NextResponse("Odoo not linked", { status: 400 });
  }

  const buf = await buildOdooOperationalPdfBuffer(brief);
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="odoo-operational-brief-${date}.pdf"`,
    },
  });
}
