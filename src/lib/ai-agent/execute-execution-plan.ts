import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { appendAgentActivity } from "@/lib/ai-agent/activity-log";
import { loadEmailCredentialBundle, loadOdooCredentialBundle } from "@/lib/ai-agent/load-user-integrations";
import type { ProposedActionPayload } from "@/lib/ai-agent/proposal-types";
import { callLLM } from "@/lib/ai/llm-unified";
import { fetchUnreadInboxSummary } from "@/lib/integrations/email-client";
import { fetchOdooOpenTasksForUser } from "@/lib/integrations/odoo-client";
import {
  addEventPlaceholder,
  listEventsPlaceholder,
} from "@/lib/ai-tools/tools/calendar-tool";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export type ExecutionPlanDetail = {
  phase: "plan_review" | "running" | "completed";
  skippedStepIndexes: number[];
  currentStepIndex: number;
  stepLog: { index: number; tool: string; message: string; at: string }[];
};

function parseDetail(detail: unknown): ExecutionPlanDetail {
  if (!isRecord(detail)) {
    return {
      phase: "plan_review",
      skippedStepIndexes: [],
      currentStepIndex: 0,
      stepLog: [],
    };
  }
  const phase =
    detail.phase === "running" || detail.phase === "completed" || detail.phase === "plan_review"
      ? detail.phase
      : "plan_review";
  const skippedStepIndexes = Array.isArray(detail.skippedStepIndexes)
    ? (detail.skippedStepIndexes as unknown[]).map((x) => Number(x)).filter((n) => Number.isFinite(n))
    : [];
  const currentStepIndex = Number.isFinite(Number(detail.currentStepIndex))
    ? Number(detail.currentStepIndex)
    : 0;
  const stepLog = Array.isArray(detail.stepLog)
    ? (detail.stepLog as { index: number; tool: string; message: string; at: string }[])
    : [];
  return { phase, skippedStepIndexes, currentStepIndex, stepLog };
}

async function runPlanStepTool(
  supabase: SupabaseClient,
  userId: string,
  tool: string,
  description: string
): Promise<string> {
  const t = tool.toLowerCase();
  if (t === "email_read") {
    const bundle = await loadEmailCredentialBundle(supabase, userId);
    if (!bundle) return "لا توجد بيانات بريد في الخزنة.";
    const r = await fetchUnreadInboxSummary(bundle, 25);
    if (r.error) return `تعذر قراءة البريد: ${r.error}`;
    return `تم جلب ${r.messages.length} رسالة تقريباً. آخر المواضيع: ${r.messages
      .slice(0, 5)
      .map((m) => m.subject)
      .join(" | ")}`;
  }
  if (t === "odoo_read_tasks") {
    const bundle = await loadOdooCredentialBundle(supabase, userId);
    if (!bundle) return "لا توجد بيانات Odoo في الخزنة.";
    const r = await fetchOdooOpenTasksForUser(bundle);
    if (r.error) return `تعذر Odoo: ${r.error}`;
    const late = r.tasks.filter((tk) => tk.date_deadline && tk.date_deadline < new Date().toISOString().slice(0, 10));
    return `مهام مفتوحة: ${r.tasks.length}. متأخرة تقريباً: ${late.length}. (${description})`;
  }
  if (t === "llm_summarize" || t === "llm_analyze" || t === "llm_route" || t === "llm_clarify") {
    const { text } = await callLLM({
      systemPrompt:
        "أنت مساعد مختصر. أعد فقرة عربية واضحة فقط دون JSON.",
      userPrompt: `المطلوب: ${description}\n\nنفّذ المطلوب باختصار شديد (120 كلمة كحد أقصى).`,
      jsonMode: false,
      maxTokens: 512,
    });
    return text;
  }
  if (t === "read_excel" || t === "analyze_excel") {
    return "خطوة Excel: أرفق رابط ملف xlsx صالح في المحادثة لاحقاً — لا يوجد رابط في الخطة التلقائية.";
  }
  if (t === "write_excel") {
    return "خطوة التصدير: ستُنشأ ملفات عبر واجهة التصدير المعتادة بعد الموافقة.";
  }
  if (t === "calendar_list") {
    return await listEventsPlaceholder(userId);
  }
  if (t === "calendar_add") {
    return await addEventPlaceholder({
      title: description.slice(0, 80),
      startIso: new Date().toISOString(),
    });
  }
  if (t === "file_read") {
    return "أرسل رابط ملف نصي لقراءته — لا يوجد رابط في هذه الخطة.";
  }
  if (t === "email_draft") {
    return `مسودة (وضعية): ${description}`;
  }
  if (t === "email_send") {
    return "الإرسال الفعلي يمر عبر مقترح بريد منفصل بعد موافقتك.";
  }
  if (t === "create_corporate_task" || t === "odoo_update_task") {
    return `يتطلب مقترحاً موقّعاً في النظام: ${description}`;
  }
  return `تم تسجيل الخطوة (${tool}) — ${description}`;
}

export async function approveExecutionPlanState(
  supabase: SupabaseClient,
  input: { userId: string; proposalId: string; skippedStepIndexes: number[] }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: row, error } = await supabase
    .from("ai_agent_proposals")
    .select("id,user_id,status,proposed_action,detail_json")
    .eq("id", input.proposalId)
    .single();

  if (error || !row || row.user_id !== input.userId || row.status !== "pending") {
    return { ok: false, error: "المقترح غير متاح." };
  }
  const pa = row.proposed_action as ProposedActionPayload;
  if (!isRecord(pa) || pa.type !== "execution_plan") {
    return { ok: false, error: "هذا ليس مقترح خطة." };
  }
  const detail = parseDetail(row.detail_json);
  if (detail.phase !== "plan_review") {
    return { ok: false, error: "تمت معالجة الخطة مسبقاً." };
  }

  const nextDetail: ExecutionPlanDetail = {
    phase: "running",
    skippedStepIndexes: [...new Set(input.skippedStepIndexes)].filter((i) => i >= 0),
    currentStepIndex: 0,
    stepLog: detail.stepLog,
  };

  const merged = {
    ...(isRecord(row.detail_json) ? row.detail_json : {}),
    ...nextDetail,
  };

  await supabase.from("ai_agent_proposals").update({ detail_json: merged }).eq("id", input.proposalId);

  await appendAgentActivity(supabase, {
    userId: input.userId,
    proposalId: input.proposalId,
    eventType: "plan_approved",
    message: "تمت الموافقة على خطة العمل — يمكنك تنفيذ الخطوات بالتتابع.",
  });

  return { ok: true };
}

export async function advanceExecutionPlanStep(
  supabase: SupabaseClient,
  input: { userId: string; proposalId: string }
): Promise<{ ok: true; message: string; done: boolean } | { ok: false; error: string }> {
  const { data: row, error } = await supabase
    .from("ai_agent_proposals")
    .select("id,user_id,status,proposed_action,detail_json")
    .eq("id", input.proposalId)
    .single();

  if (error || !row || row.user_id !== input.userId || row.status !== "pending") {
    return { ok: false, error: "المقترح غير متاح." };
  }
  const pa = row.proposed_action as ProposedActionPayload;
  if (!isRecord(pa) || pa.type !== "execution_plan") {
    return { ok: false, error: "هذا ليس مقترح خطة." };
  }
  const steps = pa.steps;
  const detail = parseDetail(row.detail_json);
  if (detail.phase !== "running") {
    return { ok: false, error: "وافق على الخطة أولاً." };
  }

  let idx = detail.currentStepIndex;
  while (idx < steps.length && detail.skippedStepIndexes.includes(idx)) {
    idx++;
  }
  if (idx >= steps.length) {
    const now = new Date().toISOString();
    await supabase
      .from("ai_agent_proposals")
      .update({
        status: "executed",
        resolved_at: now,
        executed_at: now,
        detail_json: {
          ...(isRecord(row.detail_json) ? row.detail_json : {}),
          phase: "completed",
          currentStepIndex: idx,
        },
      })
      .eq("id", input.proposalId);

    await appendAgentActivity(supabase, {
      userId: input.userId,
      proposalId: input.proposalId,
      eventType: "executed",
      message: "اكتملت جميع خطوات الخطة (أو تخطّي المتبقي).",
    });
    return { ok: true, message: "اكتملت الخطة.", done: true };
  }

  const step = steps[idx];
  const message = await runPlanStepTool(supabase, input.userId, step.tool, step.description);
  const at = new Date().toISOString();
  const stepLog = [...detail.stepLog, { index: idx, tool: step.tool, message, at }];
  const nextIndex = idx + 1;

  const merged = {
    ...(isRecord(row.detail_json) ? row.detail_json : {}),
    phase: "running",
    skippedStepIndexes: detail.skippedStepIndexes,
    currentStepIndex: nextIndex,
    stepLog,
  };

  await supabase.from("ai_agent_proposals").update({ detail_json: merged }).eq("id", input.proposalId);

  await appendAgentActivity(supabase, {
    userId: input.userId,
    proposalId: input.proposalId,
    eventType: "plan_step",
    message: `[${step.tool}] ${message.slice(0, 400)}`,
    meta: { stepIndex: idx },
  });

  let scan = nextIndex;
  while (scan < steps.length && detail.skippedStepIndexes.includes(scan)) {
    scan++;
  }
  const done = scan >= steps.length;
  if (done) {
    const now = new Date().toISOString();
    await supabase
      .from("ai_agent_proposals")
      .update({
        status: "executed",
        resolved_at: now,
        executed_at: now,
        detail_json: { ...merged, phase: "completed" },
      })
      .eq("id", input.proposalId);
    await appendAgentActivity(supabase, {
      userId: input.userId,
      proposalId: input.proposalId,
      eventType: "executed",
      message: "اكتملت خطة العمل.",
    });
  }

  return { ok: true, message, done };
}
