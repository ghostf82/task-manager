import { NextRequest, NextResponse } from "next/server";

import { runExpiryCronCheck } from "@/lib/expiry-cron/check-expirations";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Daily expiry alerts for company_documents + corporate_tasks.
 * Authorization: Bearer CRON_SECRET (same pattern as /api/cron/reminders)
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  try {
    const admin = createAdminClient();
    const result = await runExpiryCronCheck(admin);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
