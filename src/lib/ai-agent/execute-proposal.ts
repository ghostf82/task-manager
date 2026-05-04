import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { appendAgentActivity } from "@/lib/ai-agent/activity-log";
import { loadEmailCredentialBundle, loadOdooCredentialBundle } from "@/lib/ai-agent/load-user-integrations";
import type { ProposedActionPayload } from "@/lib/ai-agent/proposal-types";
import { odooAuthenticateUid, odooUpdateTaskStage, odooVerifyTaskAssigned } from "@/lib/integrations/odoo-client";
import { sendSmtpReply } from "@/lib/integrations/email-client";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseProposalDetail(detailJson: unknown): {
  allowedStageIds: number[];
  odooTaskIds: number[];
  replyEmailsAllowed: string[];
} {
  if (!isRecord(detailJson)) {
    return { allowedStageIds: [], odooTaskIds: [], replyEmailsAllowed: [] };
  }
  const allowedStageIds = Array.isArray(detailJson.allowedStageIds)
    ? (detailJson.allowedStageIds as unknown[])
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n))
    : [];
  const odooTaskIds = Array.isArray(detailJson.odooTaskIds)
    ? (detailJson.odooTaskIds as unknown[])
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n))
    : [];
  const replyEmailsAllowed = Array.isArray(detailJson.replyEmailsAllowed)
    ? (detailJson.replyEmailsAllowed as unknown[])
        .map((e) => String(e).trim().toLowerCase())
        .filter(Boolean)
    : [];
  return { allowedStageIds, odooTaskIds, replyEmailsAllowed };
}

export async function executeApprovedProposal(
  supabase: SupabaseClient,
  opts: {
    userId: string;
    proposalId: string;
    proposedAction: unknown;
    detailJson?: unknown;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const raw = opts.proposedAction;
  if (!isRecord(raw) || typeof raw.type !== "string") {
    return { ok: false, error: "تنسيق الإجراء المقترح غير صالح." };
  }

  const action = raw as ProposedActionPayload;
  const detail = parseProposalDetail(opts.detailJson);

  switch (action.type) {
    case "noop": {
      await appendAgentActivity(supabase, {
        userId: opts.userId,
        proposalId: opts.proposalId,
        eventType: "executed",
        message: "تم تنفيذ إجراء «لا شيء» (وضع تحليل فقط).",
      });
      return { ok: true };
    }

    case "create_corporate_task": {
      const { tenantId, title, dueOn } = action;
      if (!tenantId || !title?.trim() || !dueOn?.trim()) {
        return { ok: false, error: "بيانات المهمة المقترحة ناقصة." };
      }

      const { data: membership, error: memErr } = await supabase
        .from("tenant_memberships")
        .select("id")
        .eq("user_id", opts.userId)
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .maybeSingle();

      if (memErr || !membership) {
        return { ok: false, error: "لا تملك صلاحية إنشاء مهمة في هذه الشركة." };
      }

      const assigneeId =
        action.assigneeId && action.assigneeId.trim() !== ""
          ? action.assigneeId.trim()
          : null;

      if (assigneeId) {
        const { data: assigneeOk } = await supabase
          .from("tenant_memberships")
          .select("id")
          .eq("user_id", assigneeId)
          .eq("tenant_id", tenantId)
          .eq("status", "active")
          .maybeSingle();
        if (!assigneeOk) {
          return { ok: false, error: "المكلّف المقترح غير عضو نشط في نفس الشركة." };
        }
      }

      const { error: insErr } = await supabase.from("corporate_tasks").insert({
        tenant_id: tenantId,
        title: title.trim(),
        due_on: dueOn.trim(),
        notes: action.notes?.trim() ? action.notes.trim() : null,
        assignee_id: assigneeId,
        display_number: -1,
      });

      if (insErr) {
        return { ok: false, error: insErr.message || "فشل إنشاء المهمة." };
      }

      await appendAgentActivity(supabase, {
        userId: opts.userId,
        proposalId: opts.proposalId,
        eventType: "executed",
        message: `تم إنشاء مهمة شركة: ${title.trim()}`,
        meta: { tenantId, dueOn: dueOn.trim() },
      });
      return { ok: true };
    }

    case "email_reply_placeholder": {
      await appendAgentActivity(supabase, {
        userId: opts.userId,
        proposalId: opts.proposalId,
        eventType: "executed",
        message:
          "مقترح قديم (placeholder): لم يُرسل بريد — استخدم «مسح الوارد» لتوليد مقترحات بريد قابلة للتنفيذ.",
        meta: { threadKey: action.threadKey },
      });
      return { ok: true };
    }

    case "odoo_placeholder": {
      await appendAgentActivity(supabase, {
        userId: opts.userId,
        proposalId: opts.proposalId,
        eventType: "executed",
        message:
          "مقترح وضعية Odoo القديم: لا يوجد تنفيذ — استخدم المسح الآلي لربط مهام حقيقية.",
        meta: { description: action.description },
      });
      return { ok: true };
    }

    case "send_email_reply": {
      const bundle = await loadEmailCredentialBundle(supabase, opts.userId);
      if (!bundle) {
        return { ok: false, error: "لا توجد إعدادات بريد محفوظة في الخزنة." };
      }
      const toNorm = action.to.trim().toLowerCase();
      if (detail.replyEmailsAllowed.length && !detail.replyEmailsAllowed.includes(toNorm)) {
        return {
          ok: false,
          error: "عنوان المستلم غير مطابق لسياق المسح الأمني (replyEmailsAllowed).",
        };
      }

      try {
        await sendSmtpReply({
          bundle,
          to: action.to.trim(),
          subject: action.subject,
          text: action.body,
          inReplyTo: action.inReplyTo,
          references: action.references,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, error: `فشل إرسال SMTP: ${msg}` };
      }

      await appendAgentActivity(supabase, {
        userId: opts.userId,
        proposalId: opts.proposalId,
        eventType: "executed",
        message: `تم إرسال بريد إلى ${action.to.trim()} بعنوان: ${action.subject}`,
      });
      return { ok: true };
    }

    case "execution_plan": {
      return {
        ok: false,
        error:
          "مقترحات «خطة العمل» تُنفَّذ خطوة بخطوة من لوحة المقترحات — استخدم «موافقة على الخطة» ثم «تنفيذ الخطوة التالية».",
      };
    }

    case "odoo_update_task": {
      const bundle = await loadOdooCredentialBundle(supabase, opts.userId);
      if (!bundle) {
        return { ok: false, error: "لا توجد بيانات Odoo محفوظة في الخزنة." };
      }
      if (detail.odooTaskIds.length && !detail.odooTaskIds.includes(action.taskId)) {
        return {
          ok: false,
          error: "معرّف المهمة غير موجود في سياق المسح — رفض التنفيذ لأسباب أمنية.",
        };
      }
      if (
        detail.allowedStageIds.length &&
        !detail.allowedStageIds.includes(action.stageId)
      ) {
        return {
          ok: false,
          error: "مرحلة Odoo المقترحة غير مسموح بها ضمن سياق المسح.",
        };
      }

      let odooUid: number;
      try {
        odooUid = await odooAuthenticateUid(bundle);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, error: `فشل دخول Odoo: ${msg}` };
      }

      const assigned = await odooVerifyTaskAssigned({
        bundle,
        taskId: action.taskId,
        odooUid,
      });
      if (!assigned) {
        return {
          ok: false,
          error: "المهمة غير مسندة إلى حسابك في Odoo أو غير موجودة.",
        };
      }

      const upd = await odooUpdateTaskStage({
        bundle,
        taskId: action.taskId,
        stageId: action.stageId,
      });
      if (!upd.ok) {
        return { ok: false, error: upd.error };
      }

      await appendAgentActivity(supabase, {
        userId: opts.userId,
        proposalId: opts.proposalId,
        eventType: "executed",
        message: `تم تحديث مهمة Odoo #${action.taskId} إلى المرحلة ${action.stageId}.`,
      });
      return { ok: true };
    }

    case "update_company_document_expiry": {
      const { data: membership, error: memErr } = await supabase
        .from("tenant_memberships")
        .select("id")
        .eq("user_id", opts.userId)
        .eq("tenant_id", action.tenantId)
        .eq("status", "active")
        .maybeSingle();
      if (memErr || !membership) {
        return { ok: false, error: "لا تملك صلاحية تعديل مستندات هذه الشركة." };
      }

      const { data: docRow, error: docErr } = await supabase
        .from("company_documents")
        .select("id, expiry_date, document_name")
        .eq("id", action.documentId)
        .eq("tenant_id", action.tenantId)
        .maybeSingle();
      if (docErr || !docRow) {
        return { ok: false, error: "المستند غير موجود أو خارج نطاق صلاحياتك." };
      }

      const { error: updErr } = await supabase
        .from("company_documents")
        .update({ expiry_date: action.newExpiry })
        .eq("id", action.documentId)
        .eq("tenant_id", action.tenantId);
      if (updErr) {
        return { ok: false, error: `تعذّر تحديث تاريخ الانتهاء: ${updErr.message}` };
      }

      await appendAgentActivity(supabase, {
        userId: opts.userId,
        proposalId: opts.proposalId,
        eventType: "executed",
        message: `تم تحديث صلاحية المستند ${action.documentName || docRow.document_name} من ${action.oldExpiry} إلى ${action.newExpiry}.`,
      });
      return { ok: true };
    }

    default:
      return { ok: false, error: "نوع إجراء غير مدعوم." };
  }
}
