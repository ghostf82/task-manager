import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { appendAgentActivity } from "@/lib/ai-agent/activity-log";
import { appendConversationMemory } from "@/lib/ai-agent/conversation-memory";
import {
  loadOdooBrowserSessionBundle,
  loadEmailCredentialBundle,
  loadOdooConnectionState,
  loadOdooCredentialBundle,
  odooCredentialsMissingMessage,
} from "@/lib/ai-agent/load-user-integrations";
import type { ProposedActionPayload } from "@/lib/ai-agent/proposal-types";
import {
  createOdooTaskViaWebLogin,
  odooAuthenticateUid,
  odooUpdateTaskStage,
  odooVerifyTaskAssigned,
  updateOdooTaskStageViaWebLogin,
} from "@/lib/integrations/odoo-client";
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

async function postExecutionAssistantNote(
  supabase: SupabaseClient,
  userId: string,
  text: string,
  meta?: Record<string, unknown>
) {
  await supabase.from("ai_chat_messages").insert({
    user_id: userId,
    role: "assistant",
    body: text,
    metadata: { source: "proposal_execution", ...(meta ?? {}) },
  });
  await appendConversationMemory(supabase, {
    userId,
    sessionId: "ai_chat",
    role: "assistant",
    content: text,
    metadata: { source: "proposal_execution", ...(meta ?? {}) },
  });
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
      await postExecutionAssistantNote(
        supabase,
        opts.userId,
        `تم بنجاح إنشاء المهمة «${title.trim()}» وتحديد موعدها ${dueOn.trim()}.\nهل ترغب أن أضيف تذكيراً تلقائياً قبل موعد الاستحقاق؟`,
        { proposal_id: opts.proposalId, action: "create_corporate_task" }
      );
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
        const odooState = await loadOdooConnectionState(supabase, opts.userId);
        if (odooState.mode === "browser_session") {
          const browserBundle = await loadOdooBrowserSessionBundle(supabase, opts.userId);
          if (!browserBundle) {
            return { ok: false, error: "بيانات Browser Session غير مكتملة في خزنة Odoo." };
          }
          const upd = await updateOdooTaskStageViaWebLogin({
            bundle: browserBundle,
            taskId: action.taskId,
            stageId: action.stageId,
          });
          if (!upd.ok) return { ok: false, error: upd.error };
          await appendAgentActivity(supabase, {
            userId: opts.userId,
            proposalId: opts.proposalId,
            eventType: "odoo_action_success",
            message: `تم تحديث مهمة Odoo #${action.taskId} إلى المرحلة ${action.stageId} عبر Browser Session.`,
            meta: { mode: "browser_session", taskId: action.taskId, stageId: action.stageId },
          });
          await postExecutionAssistantNote(
            supabase,
            opts.userId,
            `تم تنفيذ التحديث بنجاح في Odoo: المهمة #${action.taskId} أصبحت في المرحلة ${action.stageId}.`,
            { proposal_id: opts.proposalId, action: "odoo_update_task", mode: "browser_session" }
          );
          return { ok: true };
        }
        return { ok: false, error: odooCredentialsMissingMessage() };
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
        return {
          ok: false,
          error: `تعذّر تسجيل الدخول إلى Odoo. ${odooCredentialsMissingMessage()} سبب فني: ${msg}`,
        };
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
        return {
          ok: false,
          error: `فشل تحديث المهمة في Odoo. ${odooCredentialsMissingMessage()} سبب فني: ${upd.error}`,
        };
      }

      await appendAgentActivity(supabase, {
        userId: opts.userId,
        proposalId: opts.proposalId,
        eventType: "executed",
        message: `تم تحديث مهمة Odoo #${action.taskId} إلى المرحلة ${action.stageId}.`,
      });
      await postExecutionAssistantNote(
        supabase,
        opts.userId,
        `تم تنفيذ التحديث بنجاح: مهمة Odoo رقم ${action.taskId} انتقلت إلى المرحلة ${action.stageId}.\nيمكنك متابعة المهمة مباشرة من لوحة Odoo أو طلب تحديث إضافي الآن.`,
        { proposal_id: opts.proposalId, action: "odoo_update_task" }
      );
      return { ok: true };
    }

    case "odoo_create_task": {
      const odooState = await loadOdooConnectionState(supabase, opts.userId);
      if (odooState.mode === "browser_session") {
        const browserBundle = await loadOdooBrowserSessionBundle(supabase, opts.userId);
        if (!browserBundle) {
          return { ok: false, error: "بيانات Browser Session غير مكتملة في خزنة Odoo." };
        }
        const created = await createOdooTaskViaWebLogin({
          bundle: browserBundle,
          title: action.title,
          description: action.description ?? null,
          projectId: action.projectId ?? null,
          stageId: action.stageId ?? null,
        });
        if (!created.ok) return { ok: false, error: created.error };
        await appendAgentActivity(supabase, {
          userId: opts.userId,
          proposalId: opts.proposalId,
          eventType: "odoo_action_success",
          message: `تم إنشاء مهمة Odoo جديدة (#${created.taskId}) بعنوان: ${action.title}`,
          meta: { mode: "browser_session", taskId: created.taskId },
        });
        await postExecutionAssistantNote(
          supabase,
          opts.userId,
          `تم بنجاح إنشاء مهمة Odoo جديدة بعنوان «${action.title}» (رقم ${created.taskId}).`,
          { proposal_id: opts.proposalId, action: "odoo_create_task", taskId: created.taskId }
        );
        return { ok: true };
      }
      return {
        ok: false,
        error:
          "إنشاء مهام Odoo من المساعد متاح حالياً عبر Browser Session Mode. فعّل هذا الوضع من صفحة التكاملات ثم أعد التنفيذ.",
      };
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
      await postExecutionAssistantNote(
        supabase,
        opts.userId,
        `تم بنجاح تحديث تاريخ انتهاء المستند «${action.documentName || docRow.document_name}» إلى ${action.newExpiry}.`,
        { proposal_id: opts.proposalId, action: "update_company_document_expiry" }
      );
      return { ok: true };
    }

    case "create_personal_reminder": {
      const { error: remErr } = await supabase.from("personal_reminders").insert({
        user_id: opts.userId,
        title: action.title,
        remind_at: action.remindAt,
        recurrence: action.recurrence,
        sound_enabled: action.soundEnabled,
        email_enabled: action.emailEnabled,
        is_active: true,
      });
      if (remErr) {
        return { ok: false, error: `تعذّر إنشاء التذكير: ${remErr.message}` };
      }
      await appendAgentActivity(supabase, {
        userId: opts.userId,
        proposalId: opts.proposalId,
        eventType: "executed",
        message: `تم إنشاء تذكير شخصي: ${action.title} عند ${action.remindAt}.`,
      });
      await postExecutionAssistantNote(
        supabase,
        opts.userId,
        `تم إنشاء التذكير بنجاح: «${action.title}» في ${action.remindAt}.`,
        { proposal_id: opts.proposalId, action: "create_personal_reminder" }
      );
      return { ok: true };
    }

    default:
      return { ok: false, error: "نوع إجراء غير مدعوم." };
  }
}
