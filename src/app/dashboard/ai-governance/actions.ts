"use server";

import { revalidatePath } from "next/cache";

import { getRegisteredToolSlugs } from "@/lib/ai-tools/registry";
import { requireSuperAdmin } from "@/lib/dashboard-auth";
import { tAction } from "@/lib/i18n/action-messages";
import { createClient } from "@/lib/supabase/server";

export async function setUserAiToolLicenseAction(input: {
  targetUserId: string;
  toolSlug: string;
  enabled: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireSuperAdmin();
  const supabase = await createClient();

  if (!getRegisteredToolSlugs().includes(input.toolSlug)) {
    return { ok: false, error: await tAction("errors.aiGovernance.unknownTool") };
  }

  const { error } = await supabase.from("user_ai_tools").upsert(
    {
      user_id: input.targetUserId,
      tool_slug: input.toolSlug,
      is_active: input.enabled,
      assigned_by: session.id,
    },
    { onConflict: "user_id,tool_slug" }
  );

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/dashboard/ai-governance");
  revalidatePath("/dashboard/settings/integrations");
  revalidatePath("/dashboard/ai-agent");
  return { ok: true };
}
