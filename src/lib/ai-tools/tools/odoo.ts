import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadOdooConnectionState, loadOdooCredentialBundle } from "@/lib/ai-agent/load-user-integrations";
import { fetchOdooOpenTasksForUser } from "@/lib/integrations/odoo-client";
import type { AIToolModule } from "@/lib/ai-tools/types";

export const odooAiTool: AIToolModule = {
  slug: "odoo",
  displayNameAr: "Odoo",
  displayNameEn: "Odoo",
  descriptionAr: "مهام المشروع و XML-RPC",
  descriptionEn: "Project tasks via Odoo XML-RPC.",
  requiredCredentials: ["odoo"],
  functions: ["fetchOpenTasks", "updateTaskStage"],
  async collectInbound(supabase: SupabaseClient, userId: string) {
    const connection = await loadOdooConnectionState(supabase, userId);
    if (connection.mode === "browser_session") {
      return {
        tasks: [],
        scanErrors: [
          {
            kind: "scan_odoo_error" as const,
            message:
              "Odoo يعمل حالياً بوضع Browser Session لهذا الحساب. القراءة التلقائية عبر API متوقفة، لكن إدارة الحساب متاحة عبر جلسة المتصفح.",
          },
        ],
      };
    }
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
