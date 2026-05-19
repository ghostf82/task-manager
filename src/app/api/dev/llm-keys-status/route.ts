import { NextResponse } from "next/server";

import { getLlmKeysDiagnostic, isAnyLlmApiKeyConfigured } from "@/lib/ai/llm-env";
import { requireSession } from "@/lib/dashboard-auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Super-admin only: diagnose LLM env keys without exposing secrets. */
export async function GET() {
  const session = await requireSession();
  const supabase = await createClient();
  const { data: me } = await supabase
    .from("users")
    .select("is_super_admin")
    .eq("id", session.id)
    .single();
  if (!me?.is_super_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const diagnostic = getLlmKeysDiagnostic();
  return NextResponse.json({
    ok: true,
    anyConfigured: isAnyLlmApiKeyConfigured(),
    diagnostic,
    nodeEnv: process.env.NODE_ENV ?? null,
  });
}
