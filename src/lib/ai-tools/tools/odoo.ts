import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadOdooCredentialBundle } from "@/lib/ai-agent/load-user-integrations";
import { fetchOdooOpenTasksForUser } from "@/lib/integrations/odoo-client";
import type { AIToolModule } from "@/lib/ai-tools/types";

export const odooAiTool: AIToolModule = {
  slug: "odoo",
  displayNameAr: "Odoo",
  descriptionAr: "مهام المشروع و XML-RPC",
  async collectInbound(supabase: SupabaseClient, userId: string) {
    const bundle = await loadOdooCredentialBundle(supabase, userId);
    if (!bundle) {
      return {};
    }
    const r = await fetchOdooOpenTasksForUser(bundle);
    const scanErrors =
      r.error != null && r.error !== ""
        ? [{ kind: "scan_odoo_error" as const, message: r.error }]
        : undefined;
    return {
      tasks: r.tasks,
      scanErrors,
    };
  },
};
