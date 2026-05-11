import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { loadOdooBrowserSessionBundle } from "@/lib/ai-agent/load-user-integrations";
import {
  duplicateCalendarAgendaTableSliceViaWebLogin,
  duplicateCalendarMailActivitiesSliceViaWebLogin,
  duplicateCalendarMeetingAgendaViaWebLogin,
  fetchOdooCalendarAgendaEnrichmentByEventIds,
} from "@/lib/integrations/odoo-client";
import { withSlicePostRetries } from "@/lib/netlify-slice-retry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Body = {
  userId: string;
  sourceEventId: number;
  targetEventId?: number;
  targetEventStart?: string;
  sourceEventStart?: string;
  /** read_probe = no writes; slice_table / slice_mail = one batch write; full_agenda = monolithic copy (dev only). */
  mode?: "read_probe" | "slice_table" | "slice_mail" | "full_agenda";
};

function assertSelfTestAllowed(): string | null {
  const secret = process.env.ODOO_AGENDA_SELF_TEST_SECRET?.trim();
  if (!secret) return "ODOO_AGENDA_SELF_TEST_SECRET is not set.";
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_ODOO_AGENDA_SELF_TEST_PROD !== "1") {
    return "Refused in production (set ALLOW_ODOO_AGENDA_SELF_TEST_PROD=1 to override).";
  }
  return null;
}

export async function POST(request: Request) {
  const gate = assertSelfTestAllowed();
  if (gate) return NextResponse.json({ ok: false, error: gate }, { status: 403 });

  const hdr = request.headers.get("x-odoo-self-test-secret")?.trim();
  if (!hdr || hdr !== process.env.ODOO_AGENDA_SELF_TEST_SECRET?.trim()) {
    return NextResponse.json({ ok: false, error: "Missing or invalid x-odoo-self-test-secret." }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const userId = String(body.userId ?? "").trim();
  const sourceEventId = Number(body.sourceEventId);
  const mode = body.mode ?? "read_probe";
  if (!userId) return NextResponse.json({ ok: false, error: "userId is required." }, { status: 400 });
  if (!Number.isFinite(sourceEventId) || sourceEventId <= 0) {
    return NextResponse.json({ ok: false, error: "sourceEventId must be a positive number." }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json(
      { ok: false, error: "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required." },
      { status: 500 }
    );
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const bundle = await loadOdooBrowserSessionBundle(supabase, userId);
  if (!bundle) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "No Odoo browser session for this user_id (user_odoo_credentials.database_name must be __browser_session__).",
      },
      { status: 400 }
    );
  }

  try {
    if (mode === "read_probe") {
      const enrichment = await withSlicePostRetries(() =>
        fetchOdooCalendarAgendaEnrichmentByEventIds({ bundle, eventIds: [sourceEventId] })
      );
      return NextResponse.json({
        ok: true,
        mode,
        enrichment,
        note: "No Odoo writes. Uses the same read path as the calendar panel.",
      });
    }

    const targetEventId = Number(body.targetEventId);
    if (!Number.isFinite(targetEventId) || targetEventId <= 0) {
      return NextResponse.json({ ok: false, error: "targetEventId is required for write modes." }, { status: 400 });
    }
    const targetEventStart = String(body.targetEventStart ?? "").trim();
    if (!targetEventStart) {
      return NextResponse.json(
        { ok: false, error: "targetEventStart is required for write modes (Odoo datetime of target event)." },
        { status: 400 }
      );
    }

    if (mode === "slice_table") {
      const out = await withSlicePostRetries(() =>
        duplicateCalendarAgendaTableSliceViaWebLogin({
          bundle,
          sourceEventId,
          targetEventId,
          fromIndex: 0,
          batchSize: 4,
        })
      );
      return NextResponse.json({ ok: true, mode, result: out });
    }

    if (mode === "slice_mail") {
      const out = await withSlicePostRetries(() =>
        duplicateCalendarMailActivitiesSliceViaWebLogin({
          bundle,
          sourceEventId,
          targetEventId,
          targetEventStart,
          sourceEventStart: body.sourceEventStart?.trim() || undefined,
          fromIndex: 0,
          batchSize: 3,
        })
      );
      return NextResponse.json({ ok: true, mode, result: out });
    }

    if (mode === "full_agenda") {
      const out = await withSlicePostRetries(() =>
        duplicateCalendarMeetingAgendaViaWebLogin({
          bundle,
          sourceEventId,
          targetEventId,
          targetEventStart,
          sourceEventStart: body.sourceEventStart?.trim() || undefined,
          targetDescriptionForFallback: undefined,
        })
      );
      return NextResponse.json({
        ok: true,
        mode,
        result: out,
        note: "Legacy monolithic path (same Odoo calls as pre-slice refactor). Use a disposable target event.",
      });
    }

    return NextResponse.json({ ok: false, error: `Unknown mode: ${mode}` }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    return NextResponse.json({ ok: false, error: msg, stack }, { status: 500 });
  }
}
