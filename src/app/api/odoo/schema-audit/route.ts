import { NextResponse } from "next/server";

import { requireSession } from "@/lib/dashboard-auth";
import { buildOdooSchemaAuditReport } from "@/lib/integrations/odoo-schema-audit";
import { createClient } from "@/lib/supabase/server";
import { loadOdooBrowserSessionBundle } from "@/lib/ai-agent/load-user-integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Schema audit — field coverage vs UI requirements (authenticated). */
export async function GET() {
  const session = await requireSession();
  const supabase = await createClient();
  const bundle = await loadOdooBrowserSessionBundle(supabase, session.id);
  if (!bundle) {
    return NextResponse.json({ ok: false, error: "Odoo session incomplete." }, { status: 400 });
  }
  const audit = buildOdooSchemaAuditReport();
  return NextResponse.json({ ok: true, ...audit });
}
