import { NextRequest } from "next/server";

import { handleAiChatPost } from "@/lib/ai-chat/run-ai-chat";
import { createRouteSupabaseClient } from "@/lib/supabase/route-handler";

export async function POST(req: NextRequest) {
  const supabase = await createRouteSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
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
