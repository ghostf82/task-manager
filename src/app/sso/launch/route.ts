import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Launch tokens are POST body/form only at `/auth/hr-launch`.
 * GET and query-string tokens are rejected so JWTs never land in logs/Referer.
 */
export async function GET() {
  return NextResponse.json({ error: "method" }, { status: 405 });
}

export async function POST() {
  return NextResponse.json({ error: "method" }, { status: 405 });
}
