import "server-only";

import type { ProposalKind, ProposedActionPayload } from "@/lib/ai-agent/proposal-types";
import { coerceKind, normalizeProposedAction } from "@/lib/ai/llm-proposal-normalize";
import { callLLM } from "@/lib/ai/llm-unified";

export type LlmAnalysisResult = {
  title: string;
  summary: string;
  kind: ProposalKind;
  proposed_action: ProposedActionPayload;
};

const SYSTEM = `أنت مساعد داخل نظام ERP مهام بالعربية.
أعد المخرجات كـ JSON فقط (بدون markdown) بالمفاتيح:
title (string), summary (string), kind (one of: analysis, task_create, email_reply, generic, odoo_sync),
proposed_action (object) مع الحقل type واحد من:
noop, create_corporate_task, email_reply_placeholder, odoo_placeholder.
لـ create_corporate_task استخدم: tenantId, title, dueOn (YYYY-MM-DD), notes اختياري, assigneeId اختياري أو null.
لا تستخدم send_email_reply أو odoo_update_task من هذا المسار (مخصصان للمسح الآلي فقط).
إذا كان النص لا يبرر إجراءً، استخدم type noop.
لا تخترع tenantId: إن وُجد في السياق استخدمه، وإلا استخدم noop أو analysis فقط مع proposed_action نوع noop.`;

export async function analyzeFreeTextWithLlm(input: {
  text: string;
  tenantId: string | null;
}): Promise<LlmAnalysisResult> {
  const text = input.text.trim();

  const userPayload =
    (input.tenantId
      ? `tenantId للسياق: ${input.tenantId}\n\n`
      : "لا يوجد tenantId في السياق — لا تقترح create_corporate_task إلا إذا كان النص يطلب مهمة بدون شركة محددة (استخدم noop).\n\n") +
    `النص:\n${text}`;

  const { text: raw } = await callLLM({
    systemPrompt: SYSTEM,
    userPrompt: userPayload,
    jsonMode: true,
    maxTokens: 2048,
  });

  let parsed: Partial<LlmAnalysisResult>;
  try {
    parsed = JSON.parse(raw) as Partial<LlmAnalysisResult>;
  } catch {
    return {
      title: "تحليل نصي",
      summary: raw.length > 500 ? `${raw.slice(0, 500)}…` : raw,
      kind: "analysis",
      proposed_action: { type: "noop" },
    };
  }

  const title = typeof parsed.title === "string" ? parsed.title : "مقترح";
  const summary = typeof parsed.summary === "string" ? parsed.summary : "";
  const kind = coerceKind(parsed.kind);
  let proposed_action = normalizeProposedAction(parsed.proposed_action);

  if (
    proposed_action.type === "send_email_reply" ||
    proposed_action.type === "odoo_update_task" ||
    proposed_action.type === "execution_plan"
  ) {
    proposed_action = { type: "noop" };
  }

  if (proposed_action.type === "create_corporate_task") {
    if (!input.tenantId || proposed_action.tenantId !== input.tenantId) {
      return {
        title,
        summary,
        kind: "analysis",
        proposed_action: { type: "noop" },
      };
    }
  }

  return { title, summary, kind, proposed_action };
}
