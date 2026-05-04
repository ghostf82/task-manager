import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadEmailCredentialBundle } from "@/lib/ai-agent/load-user-integrations";
import { fetchUnreadInboxSummary } from "@/lib/integrations/email-client";
import type { AIToolModule } from "@/lib/ai-tools/types";

export const emailAiTool: AIToolModule = {
  slug: "email",
  displayNameAr: "البريد الإلكتروني",
  displayNameEn: "Email",
  descriptionAr: "IMAP / SMTP",
  descriptionEn: "Read inbox summaries and send SMTP replies after approval.",
  requiredCredentials: ["imap_smtp"],
  functions: ["fetchUnread", "sendReply", "readThread"],
  async collectInbound(supabase: SupabaseClient, userId: string) {
    const bundle = await loadEmailCredentialBundle(supabase, userId);
    if (!bundle) {
      return {};
    }
    const r = await fetchUnreadInboxSummary(bundle, 40);
    const scanErrors =
      r.error != null && r.error !== ""
        ? [{ kind: "scan_email_error" as const, message: r.error }]
        : undefined;
    return {
      emails: r.messages,
      scanErrors,
    };
  },
};
