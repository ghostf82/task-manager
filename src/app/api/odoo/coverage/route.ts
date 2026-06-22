import { NextResponse } from "next/server";

import { getOdooDataCoverageAction } from "@/app/dashboard/ai-agent/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** P0-D: Live Odoo data coverage vs cache snapshot (authenticated). */
export async function GET() {
  const res = await getOdooDataCoverageAction();
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, ...res.coverage });
}
