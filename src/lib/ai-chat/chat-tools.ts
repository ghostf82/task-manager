import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { appendAgentActivity } from "@/lib/ai-agent/activity-log";
import type { ProposalKind, ProposedActionPayload } from "@/lib/ai-agent/proposal-types";
import { coerceKind, normalizeProposedAction } from "@/lib/ai/llm-proposal-normalize";
import {
  documentDaysUntilExpiry,
  documentRowTone,
  documentStatusLabelsAr,
} from "@/lib/company-documents";
import { statusLabelsAr, type TaskStatus } from "@/lib/corporate-tasks";

export type ChatToolContext = {
  supabase: SupabaseClient;
  userId: string;
  licensedToolSlugs: string[];
  tenantIds: string[];
  todayStr: string;
};

export type CreatedProposalInfo = { id: string; title: string; summary: string };

export async function executeAiChatTool(
  name: string,
  rawArgs: string,
  ctx: ChatToolContext
): Promise<{ text: string; createdProposal?: CreatedProposalInfo }> {
  let args: Record<string, unknown> = {};
  try {
    args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
  } catch {
    return { text: "خطأ: وسيطات الأداة ليست JSON صالحاً." };
  }

  switch (name) {
    case "list_company_documents": {
      const limit = Math.min(50, Math.max(1, Number(args.max_rows) || 25));
      const { data, error } = await ctx.supabase
        .from("company_documents")
        .select(
          "id, tenant_id, document_name, document_number, expiry_date, alert_days_before, status, tenants ( name )"
        )
        .order("expiry_date", { ascending: true })
        .limit(limit);
      if (error) return { text: `خطأ قاعدة البيانات: ${error.message}` };
      const rows = (data ?? []).map((r) => {
        const t = r.tenants as { name?: string } | null;
        const tenantName = t && typeof t === "object" && "name" in t ? String(t.name) : "—";
        const exp = String(r.expiry_date);
        const alert = Number(r.alert_days_before);
        const tone = documentRowTone(exp, alert, ctx.todayStr);
        const days = documentDaysUntilExpiry(exp, ctx.todayStr);
        const st = r.status as keyof typeof documentStatusLabelsAr;
        const statusAr = documentStatusLabelsAr[st] ?? String(r.status);
        return {
          tenant: tenantName,
          name: r.document_name,
          number: r.document_number,
          expiry: exp,
          alert_days_before: alert,
          status_ar: statusAr,
          days_until_expiry: days,
          tone,
        };
      });
      return { text: JSON.stringify({ documents: rows }, null, 2) };
    }

    case "list_corporate_tasks": {
      const limit = Math.min(50, Math.max(1, Number(args.max_rows) || 25));
      const onlyOpen = Boolean(args.only_open);
      let q = ctx.supabase
        .from("corporate_tasks")
        .select(
          "id, tenant_id, display_number, title, due_on, status, completion_percent, tenants ( name )"
        )
        .order("due_on", { ascending: true })
        .limit(limit);
      if (onlyOpen) {
        q = q.in("status", ["not_started", "in_progress", "on_hold"]);
      }
      const { data, error } = await q;
      if (error) return { text: `خطأ قاعدة البيانات: ${error.message}` };
      const rows = (data ?? []).map((r) => {
        const t = r.tenants as { name?: string } | null;
        const tenantName = t && typeof t === "object" && "name" in t ? String(t.name) : "—";
        const st = r.status as TaskStatus;
        return {
          tenant: tenantName,
          number: r.display_number,
          title: r.title,
          due_on: r.due_on,
          status_ar: statusLabelsAr[st] ?? String(r.status),
          completion_percent: r.completion_percent,
        };
      });
      return { text: JSON.stringify({ tasks: rows }, null, 2) };
    }

    case "create_pending_proposal": {
      const title = typeof args.title === "string" ? args.title.trim() : "";
      const summary = typeof args.summary === "string" ? args.summary.trim() : "";
      const kind = coerceKind(args.kind);
      const tenantRaw = args.tenant_id;
      const tenantId =
        typeof tenantRaw === "string" && tenantRaw.trim() ? tenantRaw.trim() : null;

      if (!title || !summary) {
        return { text: "رفض: العنوان والملخص مطلوبان لإنشاء مقترح." };
      }

      if (tenantId && !ctx.tenantIds.includes(tenantId)) {
        return { text: "رفض: tenant_id لا يخص الشركات المتاحة للمستخدم." };
      }

      const proposed = normalizeProposedAction(args.proposed_action);
      if (proposed.type === "noop") {
        return { text: "رفض: proposed_action غير صالح أو مفقود." };
      }
      if (proposed.type === "execution_plan") {
        return { text: "رفض: خطط التنفيذ متعددة الخطوات تُنشأ من محرك التخطيط فقط، وليس عبر هذه الأداة." };
      }

      if (proposed.type === "send_email_reply") {
        if (!ctx.licensedToolSlugs.includes("email")) {
          return { text: "رفض: المستخدم لا يملك ترخيص أداة البريد." };
        }
      }
      if (proposed.type === "odoo_update_task") {
        if (!ctx.licensedToolSlugs.includes("odoo")) {
          return { text: "رفض: المستخدم لا يملك ترخيص أداة Odoo." };
        }
      }
      if (proposed.type === "create_corporate_task") {
        if (!ctx.tenantIds.includes(proposed.tenantId)) {
          return { text: "رفض: شركة المهمة غير مسموحة للمستخدم." };
        }
      }
      if (proposed.type === "update_company_document_expiry") {
        if (!ctx.tenantIds.includes(proposed.tenantId)) {
          return { text: "رفض: شركة المستند غير مسموحة للمستخدم." };
        }
      }

      const detail_json: Record<string, unknown> = {
        source: "ai_chat",
        created_via: "tool",
      };

      const { data: ins, error } = await ctx.supabase
        .from("ai_agent_proposals")
        .insert({
          user_id: ctx.userId,
          tenant_id: tenantId,
          kind: kind as ProposalKind,
          title,
          summary,
          detail_json,
          proposed_action: proposed as unknown as ProposedActionPayload,
          status: "pending",
        })
        .select("id")
        .single();

      if (error || !ins?.id) {
        return { text: `تعذّر حفظ المقترح: ${error?.message ?? "unknown"}` };
      }

      await appendAgentActivity(ctx.supabase, {
        userId: ctx.userId,
        proposalId: ins.id,
        eventType: "proposed",
        message: `مقترح من الدردشة الذكية: ${title}`,
      });

      return {
        text: JSON.stringify(
          {
            ok: true,
            proposal_id: ins.id,
            message:
              "تم إنشاء مقترح في انتظار الموافقة. أخبر المستخدم أن يراجع بطاقة «مراجعة وموافقة» في الدردشة أو من صفحة المساعد الذكي.",
          },
          null,
          2
        ),
        createdProposal: { id: ins.id as string, title, summary },
      };
    }

    default:
      return { text: `أداة غير معروفة: ${name}` };
  }
}

export const AI_CHAT_TOOLS_OPENAI = [
  {
    type: "function" as const,
    function: {
      name: "list_company_documents",
      description:
        "جلب مستندات الشركات ضمن صلاحيات المستخدم (RLS) مع تواريخ الانتهاء والتنبيهات.",
      parameters: {
        type: "object",
        properties: {
          max_rows: { type: "integer", description: "حد أقصى للصفوف (1–50)" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_corporate_tasks",
      description: "جلب مهام الشركات المسموح بها للمستخدم مع التواريخ والحالات.",
      parameters: {
        type: "object",
        properties: {
          max_rows: { type: "integer" },
          only_open: {
            type: "boolean",
            description: "إن كان true يُستبعد المكتمل والملغى",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_pending_proposal",
      description:
        "إنشاء مقترح تنفيذي يحتاج موافقة بشرية (لا يُنفَّذ فوراً). استخدمه لطلبات مثل إرسال بريد أو تحديث Odoo أو إنشاء مهمة شركة.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          kind: {
            type: "string",
            enum: ["email_reply", "task_create", "odoo_sync", "generic", "analysis"],
          },
          tenant_id: { type: "string", description: "uuid شركة أو فارغ" },
          proposed_action: { type: "object" },
        },
        required: ["title", "summary", "kind", "proposed_action"],
      },
    },
  },
];
