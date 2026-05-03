import "server-only";

import OpenAI from "openai";

import type { OdooTaskRecord } from "@/lib/integrations/odoo-xmlrpc";
import type { InboundEmailSummary } from "@/lib/integrations/email-client";
import type { LlmAnalysisResult } from "@/lib/ai/llm-analyze";
import { coerceKind, normalizeProposedAction } from "@/lib/ai/llm-proposal-normalize";

const INBOUND_SYSTEM = `أنت مساعد داخل نظام ERP مهام بالعربية.
ستستلم JSON يصف مهام Odoo المفتوحة ورسائل بريد غير مقروءة.
أعد مخرجات JSON فقط بالشكل: { "proposals": [ ... ] }
حيث كل عنصر يحتوي: title, summary, kind (email_reply | odoo_sync | analysis | generic),
و proposed_action من الأنواع التالية فقط:
- noop
- odoo_update_task مع taskId و stageId أعداد صحيحة يجب أن تكون مستمدة من السياق (من قائمة المهام والمراحل المسموح بها).
- send_email_reply مع to و subject و body حيث to يجب أن يطابق بالضبط أحد عناوين replyEmailsAllowed، و inReplyTo/references إن وُجدت في السياق لنفس الرسالة.

قواعد صارمة:
- لا تخترع taskId أو stageId أو عناوين بريد غير موجودة في السياق.
- لا تتجاوز 8 مقترحات. إن لم يكن هناك ما يبرر إجراءً، أعد مصفوفة فارغة أو عنصر analysis مع noop.
- اكتب summary و title بالعربية الفصحى الواضحة.`;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function normalizeInboundProposal(
  raw: unknown,
  ctx: {
    allowedStageIds: number[];
    odooTaskIds: number[];
    replyEmailsAllowed: string[];
    messageIdByEmail: Map<string, string>;
  }
): LlmAnalysisResult | null {
  if (!isRecord(raw)) return null;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const summary = typeof raw.summary === "string" ? raw.summary.trim() : "";
  if (!title || !summary) return null;
  const kind = coerceKind(raw.kind);
  let proposed_action = normalizeProposedAction(raw.proposed_action);

  if (proposed_action.type === "odoo_update_task") {
    if (
      !ctx.odooTaskIds.includes(proposed_action.taskId) ||
      !ctx.allowedStageIds.includes(proposed_action.stageId)
    ) {
      proposed_action = { type: "noop" };
    }
  }

  if (proposed_action.type === "send_email_reply") {
    const toLower = proposed_action.to.trim().toLowerCase();
    const allowed = new Set(ctx.replyEmailsAllowed.map((e) => e.toLowerCase()));
    if (!allowed.has(toLower)) {
      proposed_action = { type: "noop" };
    } else {
      const mid = ctx.messageIdByEmail.get(toLower);
      if (mid && !proposed_action.inReplyTo) {
        proposed_action = {
          ...proposed_action,
          inReplyTo: mid,
          references: proposed_action.references ?? mid,
        };
      }
    }
  }

  return { title, summary, kind, proposed_action };
}

export async function analyzeInboundSourcesWithLlm(input: {
  tasks: OdooTaskRecord[];
  emails: InboundEmailSummary[];
  tenantId: string | null;
  allowedStageIds: number[];
  odooTaskIds: number[];
  replyEmailsAllowed: string[];
}): Promise<LlmAnalysisResult[]> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    return [];
  }

  const messageIdByEmail = new Map<string, string>();
  for (const e of input.emails) {
    const k = e.replyTo.trim().toLowerCase();
    if (k && e.messageId) {
      messageIdByEmail.set(k, e.messageId);
    }
  }

  const ctx = {
    allowedStageIds: input.allowedStageIds,
    odooTaskIds: input.odooTaskIds,
    replyEmailsAllowed: input.replyEmailsAllowed,
    messageIdByEmail,
  };

  const payload = {
    tenantId: input.tenantId,
    tasks: input.tasks.map((t) => ({
      id: t.id,
      name: t.name,
      date_deadline: t.date_deadline,
      stage_id: t.stage_id,
      project_id: t.project_id,
      description_excerpt:
        typeof t.description === "string"
          ? t.description.replace(/<[^>]+>/g, " ").trim().slice(0, 400)
          : "",
    })),
    emails: input.emails.map((m) => ({
      uid: m.uid,
      subject: m.subject,
      from: m.from,
      replyEmailsAllowed: m.replyTo,
      date: m.date,
      messageId: m.messageId,
      preview: m.textPreview,
    })),
    allowedStageIds: input.allowedStageIds,
    odooTaskIds: input.odooTaskIds,
    replyEmailsAllowed: input.replyEmailsAllowed,
  };

  const openai = new OpenAI({ apiKey: key });
  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: INBOUND_SYSTEM },
      {
        role: "user",
        content: `السياق:\n${JSON.stringify(payload, null, 2)}`,
      },
    ],
    temperature: 0.15,
    max_tokens: 4096,
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return [];
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.proposals)) {
    return [];
  }

  const out: LlmAnalysisResult[] = [];
  for (const item of parsed.proposals.slice(0, 8)) {
    const row = normalizeInboundProposal(item, ctx);
    if (row) {
      out.push(row);
    }
  }
  return out;
}
