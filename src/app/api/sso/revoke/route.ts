import { NextResponse, type NextRequest } from "next/server";

import { consumeRevokeToken } from "@/lib/sso/consume";
import { readJwtConfigFromEnv } from "@/lib/sso/launch-jwt";
import { createSupabaseSsoPorts } from "@/lib/sso/supabase-ports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Portal-signed revoke. Body `{ token }` or `Authorization: Bearer`.
 * grant claim must be false. Isolated preview — no production webhook assumed.
 */
export async function POST(request: NextRequest) {
  const cfg = readJwtConfigFromEnv();
  if ("error" in cfg) {
    return NextResponse.json({ error: "unconfigured" }, { status: 503 });
  }

  let token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) {
    const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
    token = typeof body?.token === "string" ? body.token.trim() : "";
  }
  if (!token) {
    return NextResponse.json({ error: "missing_token" }, { status: 400 });
  }

  try {
    const result = await consumeRevokeToken(token, cfg, createSupabaseSsoPorts());
    if (!result.ok) {
      const status = result.code === "replay" ? 409 : 401;
      return NextResponse.json({ error: result.code }, { status });
    }
    return NextResponse.json({ ok: true, platform_user_id: result.platformUserId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "failed";
    return NextResponse.json({ error: "failed", message }, { status: 500 });
  }
}
