import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  advancePersonalReminderIfDue,
  type PersonalReminderRow,
} from "@/lib/reminders/advance";

/**
 * Background firing for reminder emails when users are offline.
 * Netlify: scheduled function `netlify/functions/cron-reminders.mjs` (every 15m UTC), or manual call with Authorization: Bearer CRON_SECRET
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: due, error } = await admin
    .from("personal_reminders")
    .select("*")
    .eq("is_active", true)
    .lte("remind_at", nowIso);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let processed = 0;
  for (const raw of due ?? []) {
    const row = raw as PersonalReminderRow;
    const { data: u } = await admin
      .from("users")
      .select("email")
      .eq("id", row.user_id)
      .single();
    const ok = await advancePersonalReminderIfDue(admin, row, u?.email ?? null, {
      sendEmail: true,
    });
    if (ok) processed++;
  }

  return NextResponse.json({ ok: true, processed });
}
