import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  loadOdooBrowserSessionBundle,
  loadOdooConnectionState,
  loadOdooCredentialBundle,
} from "@/lib/ai-agent/load-user-integrations";
import {
  fetchOdooOpenTasksForUser,
  fetchOdooOpenTasksViaWebLogin,
  searchOdooTasksViaWebLogin,
} from "@/lib/integrations/odoo-client";
import type { AIToolModule } from "@/lib/ai-tools/types";

export const odooAiTool: AIToolModule = {
  slug: "odoo",
  displayNameAr: "Odoo",
  displayNameEn: "Odoo",
  descriptionAr: "مهام المشروع و XML-RPC",
  descriptionEn: "Project tasks via Odoo API/Web session.",
  requiredCredentials: ["odoo"],
  functions: ["fetchOpenTasks", "updateTaskStage", "createTask", "searchTasks"],
  async collectInbound(supabase: SupabaseClient, userId: string) {
    const connection = await loadOdooConnectionState(supabase, userId);
    if (connection.mode === "browser_session") {
      const browserBundle = await loadOdooBrowserSessionBundle(supabase, userId);
      if (browserBundle) {
        const viaSession = await fetchOdooOpenTasksViaWebLogin(browserBundle);
        // Fallback to a broader search if strict "open tasks for me" returns empty.
        if (!viaSession.error && viaSession.tasks.length === 0) {
          const broad = await searchOdooTasksViaWebLogin({
            bundle: browserBundle,
            limit: 120,
          });
          if (!broad.error && broad.tasks.length > 0) {
            return {
              tasks: broad.tasks.map((t) => ({
                id: t.id,
                name: t.name,
                date_deadline: t.date_deadline ?? false,
                stage_id: t.stage_id ?? false,
                user_ids: Array.isArray(t.user_ids) ? t.user_ids : [],
                user_id: t.user_id ?? false,
                project_id: t.project_id ?? false,
                description: t.description ?? false,
              })),
            };
          }
        }
        const scanErrors =
          viaSession.error != null && viaSession.error !== ""
            ? [{ kind: "scan_odoo_error" as const, message: viaSession.error }]
            : undefined;
        return {
          tasks: viaSession.tasks,
          scanErrors,
        };
      }
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
