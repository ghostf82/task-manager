import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { appendAgentActivity } from "@/lib/ai-agent/activity-log";
import { getAiToolBySlug } from "@/lib/ai-tools/registry";
import { getLicensedActiveToolSlugs } from "@/lib/ai-tools/user-licenses";
import type { InboundEmailSummary } from "@/lib/integrations/email-client";
import type { OdooTaskRecord } from "@/lib/integrations/odoo-xmlrpc";

export type LicensedInboundCollectResult = {
  tasks: OdooTaskRecord[];
  emails: InboundEmailSummary[];
};

/**
 * Runs only tools that are both registered and licensed for the user.
 */
export async function collectLicensedInboundData(
  supabase: SupabaseClient,
  userId: string
): Promise<LicensedInboundCollectResult> {
  const slugs = await getLicensedActiveToolSlugs(supabase, userId);
  const tasks: OdooTaskRecord[] = [];
  const emails: InboundEmailSummary[] = [];

  for (const slug of slugs) {
    const tool = getAiToolBySlug(slug);
    if (!tool) continue;
    const part = await tool.collectInbound(supabase, userId);
    if (part.tasks?.length) {
      tasks.push(...part.tasks);
    }
    if (part.emails?.length) {
      emails.push(...part.emails);
    }
    if (part.scanErrors?.length) {
      for (const err of part.scanErrors) {
        await appendAgentActivity(supabase, {
          userId,
          eventType: err.kind,
          message: err.message,
        });
      }
    }
  }

  return { tasks, emails };
}
