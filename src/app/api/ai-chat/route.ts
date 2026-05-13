import { NextRequest } from "next/server";

import { handleAiChatPost } from "@/lib/ai-chat/run-ai-chat";
import { createRouteSupabaseClient } from "@/lib/supabase/route-handler";

/** Avoid Edge quirks with streaming bodies and binary chunk coercion (ByteString). */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Match dashboard / Netlify long-running tool paths so streaming chat is not cut off early. */
export const maxDuration = 120;

const JSON_UTF8 = { "Content-Type": "application/json; charset=utf-8" } as const;

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: JSON_UTF8 });
}

export async function POST(req: NextRequest) {
  /**
   * Streams SSE from handleAiChatPost. Browser extensions may still surface `message channel closed`
   * in the console during long reads; that cannot be suppressed from route code.
   */
  const supabase = await createRouteSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const content =
    typeof body === "object" &&
    body !== null &&
    "content" in body &&
    typeof (body as { content: unknown }).content === "string"
      ? (body as { content: string }).content
      : "";

  return handleAiChatPost({
    supabase,
    userId: user.id,
    content,
  });
}
