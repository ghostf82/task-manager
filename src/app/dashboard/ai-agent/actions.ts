"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { analyzeFreeTextWithLlm } from "@/lib/ai/llm-analyze";
import { analyzeInboundSourcesWithLlm } from "@/lib/ai/llm-inbound";
import type { LlmAnalysisResult } from "@/lib/ai/llm-analyze";
import { appendAgentActivity } from "@/lib/ai-agent/activity-log";
import {
  advanceExecutionPlanStep,
  approveExecutionPlanState,
} from "@/lib/ai-agent/execute-execution-plan";
import { appendConversationMemory, getRecentMemory } from "@/lib/ai-agent/conversation-memory";
import { analyzeIntent } from "@/lib/ai-agent/planning-engine";
import { executeApprovedProposal } from "@/lib/ai-agent/execute-proposal";
import type { ProposedActionPayload } from "@/lib/ai-agent/proposal-types";
import { normalizeProposedAction } from "@/lib/ai/llm-proposal-normalize";
import { collectLicensedInboundData } from "@/lib/ai-tools/collect-licensed-inbound";
import { getLicensedActiveToolSlugs } from "@/lib/ai-tools/user-licenses";
import { requireSession } from "@/lib/dashboard-auth";
import { tAction, tActionFill } from "@/lib/i18n/action-messages";
import type { OdooTaskRecord } from "@/lib/integrations/odoo-xmlrpc";
import { createClient } from "@/lib/supabase/server";
import {
  archiveOdooRecordViaWebLogin,
  createOdooCalendarEventViaWebLogin,
  createOdooDocumentViaWebLogin,
  createOdooProjectViaWebLogin,
  createOdooTaskViaWebLogin,
  copyOdooCalendarEventViaWebLogin,
  duplicateCalendarMeetingAgendaViaWebLogin,
  deleteOdooRecordViaWebLogin,
  listOdooCalendarEventsViaWebLogin,
  listOdooDocumentsViaWebLogin,
  listOdooProjectsViaWebLogin,
  searchOdooTasksViaWebLogin,
  updateOdooCalendarEventViaWebLogin,
  updateOdooDocumentViaWebLogin,
  updateOdooProjectViaWebLogin,
  updateOdooTaskViaWebLogin,
  updateOdooTaskStageViaWebLogin,
} from "@/lib/integrations/odoo-client";
import { loadOdooBrowserSessionBundle, loadOdooConnectionState } from "@/lib/ai-agent/load-user-integrations";

export type ScanResult = {
  ok: boolean;
  message: string;
  inserted: number;
  taskCount: number;
  emailCount: number;
};

function mergeProposedActionWithEmailEdits(
  proposed: unknown,
  emailBody?: string,
  emailSubject?: string
): unknown {
  if (!emailBody && !emailSubject) return proposed;
  if (!proposed || typeof proposed !== "object" || Array.isArray(proposed)) return proposed;
  const a = proposed as Record<string, unknown>;
  if (a.type !== "send_email_reply") return proposed;
  return {
    ...a,
    body: emailBody?.trim() ? emailBody.trim() : a.body,
    subject: emailSubject?.trim() ? emailSubject.trim() : a.subject,
  };
}

function enrichProposalDetailJson(
  base: Record<string, unknown>,
  proposed: LlmAnalysisResult["proposed_action"],
  tasks: OdooTaskRecord[],
  emailCount: number
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    ...base,
    preview: { odoo_tasks: tasks.length, emails: emailCount },
  };
  const pa = proposed as ProposedActionPayload;
  if (pa.type === "odoo_update_task") {
    const task = tasks.find((tk) => tk.id === pa.taskId);
    const currentName =
      task?.stage_id && Array.isArray(task.stage_id) ? String(task.stage_id[1]) : "—";
    const currentId =
      task?.stage_id && Array.isArray(task.stage_id) ? Number(task.stage_id[0]) : null;
    let targetName = `Stage #${pa.stageId}`;
    for (const tk of tasks) {
      if (tk.stage_id && Array.isArray(tk.stage_id) && Number(tk.stage_id[0]) === pa.stageId) {
        targetName = String(tk.stage_id[1]);
        break;
      }
    }
    out.odooPreview = {
      taskId: pa.taskId,
      taskName: task?.name ?? `#${pa.taskId}`,
      currentStageId: currentId,
      currentStageName: currentName,
      targetStageId: pa.stageId,
      targetStageName: targetName,
    };
  }
  if (pa.type === "send_email_reply") {
    out.mailPreview = {
      to: pa.to,
      subject: pa.subject,
    };
  }
  return out;
}

export async function analyzePasteAction(formData: FormData) {
  const session = await requireSession();
  const text = String(formData.get("text") ?? "").trim();
  const tenantRaw = String(formData.get("tenant_id") ?? "").trim();
  const tenantId = tenantRaw.length > 0 ? tenantRaw : null;

  if (!text) {
    redirect("/dashboard/ai-agent?err=text");
  }

  const supabase = await createClient();
  await appendConversationMemory(supabase, {
    userId: session.id,
    sessionId: "paste",
    role: "user",
    content: text,
  });

  const licensedSlugs = await getLicensedActiveToolSlugs(supabase, session.id);
  const { data: memberships } = await supabase
    .from("tenant_memberships")
    .select("tenants(name)")
    .eq("user_id", session.id)
    .eq("status", "active");

  const tenantNames: string[] = [];
  for (const m of memberships ?? []) {
    const tn = m.tenants;
    if (tn && typeof tn === "object" && !Array.isArray(tn) && "name" in tn) {
      tenantNames.push(String((tn as { name: string }).name));
    } else if (Array.isArray(tn) && tn[0] && typeof tn[0] === "object" && "name" in tn[0]) {
      tenantNames.push(String((tn[0] as { name: string }).name));
    }
  }

  const mem = await getRecentMemory(supabase, session.id, "paste", 10);
  const plan = analyzeIntent(text, {
    recentUserPhrases: mem.filter((r) => r.role === "user").map((r) => r.content),
    licensedToolSlugs: licensedSlugs,
    tenantNames,
  });

  if (plan.steps.length > 3) {
    const proposed = normalizeProposedAction({
      type: "execution_plan",
      intent: plan.intent,
      steps: plan.steps,
    });
    if (proposed.type !== "execution_plan") {
      redirect("/dashboard/ai-agent?err=proposal");
    }

    const { data: ins, error } = await supabase
      .from("ai_agent_proposals")
      .insert({
        user_id: session.id,
        tenant_id: tenantId,
        kind: "generic",
        title: `خطة تنفيذ (${plan.intent})`,
        summary: plan.steps.map((s) => s.description).join(" — "),
        detail_json: {
          source: "paste",
          phase: "plan_review",
          skippedStepIndexes: [],
          currentStepIndex: 0,
          stepLog: [],
        },
        proposed_action: proposed as unknown as ProposedActionPayload,
        status: "pending",
      })
      .select("id")
      .single();

    if (error || !ins) {
      console.error("proposal insert", error);
      redirect("/dashboard/ai-agent?err=insert");
    }

    await appendAgentActivity(supabase, {
      userId: session.id,
      proposalId: ins.id,
      eventType: "proposed",
      message: await tActionFill("aiAgentActions.logNewProposal", {
        title: `خطة (${plan.intent})`,
      }),
    });

    revalidatePath("/dashboard/ai-agent");
    redirect("/dashboard/ai-agent?ok=analysis");
  }

  let analysis;
  try {
    analysis = await analyzeFreeTextWithLlm({ text, tenantId });
  } catch (e) {
    console.error("analyzeFreeTextWithLlm", e);
    redirect("/dashboard/ai-agent?err=llm");
  }

  const { data: ins, error } = await supabase
    .from("ai_agent_proposals")
    .insert({
      user_id: session.id,
      tenant_id: tenantId,
      kind: analysis.kind,
      title: analysis.title,
      summary: analysis.summary,
      detail_json: { source: "paste", length: text.length },
      proposed_action: analysis.proposed_action,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !ins) {
    console.error("proposal insert", error);
    redirect("/dashboard/ai-agent?err=insert");
  }

  await appendAgentActivity(supabase, {
    userId: session.id,
    proposalId: ins.id,
    eventType: "proposed",
    message: await tActionFill("aiAgentActions.logNewProposal", { title: analysis.title }),
  });

  revalidatePath("/dashboard/ai-agent");
  redirect("/dashboard/ai-agent?ok=analysis");
}

export async function confirmProposalExecutionAction(input: {
  proposalId: string;
  emailBody?: string;
  emailSubject?: string;
}): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const session = await requireSession();
  const id = input.proposalId.trim();
  if (!id) {
    return { ok: false, error: await tAction("aiAgentActions.proposalInvalidId") };
  }

  const supabase = await createClient();
  const { data: prop, error } = await supabase
    .from("ai_agent_proposals")
    .select("id,user_id,status,proposed_action,detail_json")
    .eq("id", id)
    .single();

  if (error || !prop || prop.user_id !== session.id) {
    return { ok: false, error: await tAction("aiAgentActions.proposalNotFound") };
  }
  if (prop.status !== "pending") {
    return { ok: false, error: await tAction("aiAgentActions.proposalNotPending") };
  }

  const paRaw = prop.proposed_action;
  const paType =
    paRaw && typeof paRaw === "object" && !Array.isArray(paRaw) && "type" in paRaw
      ? String((paRaw as Record<string, unknown>).type)
      : "";
  if (paType === "execution_plan") {
    return { ok: false, error: await tAction("aiAgentActions.usePlanFlow") };
  }

  const proposedAction = mergeProposedActionWithEmailEdits(
    prop.proposed_action,
    input.emailBody,
    input.emailSubject
  );

  await appendAgentActivity(supabase, {
    userId: session.id,
    proposalId: id,
    eventType: "approved",
    message: await tAction("aiAgentActions.logUserApproved"),
  });

  let exec: { ok: true } | { ok: false; error: string };
  try {
    exec = await executeApprovedProposal(supabase, {
      userId: session.id,
      proposalId: id,
      proposedAction,
      detailJson: prop.detail_json,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : await tAction("aiAgentActions.execUnknownError");
    exec = { ok: false, error: msg };
  }

  const now = new Date().toISOString();

  if (exec.ok) {
    await supabase
      .from("ai_agent_proposals")
      .update({
        status: "executed",
        resolved_at: now,
        executed_at: now,
        execution_error: null,
      })
      .eq("id", id)
      .eq("status", "pending");
    revalidatePath("/dashboard/ai-agent");
    return { ok: true, message: await tAction("aiAgentActions.execSuccess") };
  }

  await supabase
    .from("ai_agent_proposals")
    .update({
      status: "failed",
      resolved_at: now,
      execution_error: exec.error,
    })
    .eq("id", id)
    .eq("status", "pending");

  await appendAgentActivity(supabase, {
    userId: session.id,
    proposalId: id,
    eventType: "failed",
    message: exec.error,
  });

  revalidatePath("/dashboard/ai-agent");
  return { ok: false, error: exec.error };
}

export async function rejectProposalAsync(
  proposalId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireSession();
  const id = proposalId.trim();
  if (!id) {
    return { ok: false, error: await tAction("aiAgentActions.proposalInvalidId") };
  }

  const supabase = await createClient();
  const now = new Date().toISOString();

  const { data: rows, error } = await supabase
    .from("ai_agent_proposals")
    .update({ status: "rejected", resolved_at: now })
    .eq("id", id)
    .eq("user_id", session.id)
    .eq("status", "pending")
    .select("id");

  if (error || !rows?.length) {
    return { ok: false, error: await tAction("aiAgentActions.rejectFailed") };
  }

  await appendAgentActivity(supabase, {
    userId: session.id,
    proposalId: id,
    eventType: "rejected",
    message: await tAction("aiAgentActions.logUserRejected"),
  });

  revalidatePath("/dashboard/ai-agent");
  return { ok: true };
}

export async function runInboundScanAsync(): Promise<ScanResult> {
  const session = await requireSession();
  const supabase = await createClient();

  try {
    const licensed = await getLicensedActiveToolSlugs(supabase, session.id);
    if (!licensed.length) {
      return {
        ok: false,
        message: await tAction("aiAgentActions.scanNoTools"),
        inserted: 0,
        taskCount: 0,
        emailCount: 0,
      };
    }

    const { tasks, emails } = await collectLicensedInboundData(supabase, session.id);

    const taskCount = tasks.length;
    const emailCount = emails.length;

    const allowedStageIds = [
      ...new Set(
        tasks.flatMap((tk) => {
          if (tk.stage_id && Array.isArray(tk.stage_id) && typeof tk.stage_id[0] === "number") {
            return [Number(tk.stage_id[0])];
          }
          return [];
        })
      ),
    ];
    const odooTaskIds = tasks.map((tk) => tk.id);
    const replyEmailsRaw = emails.map((e) => e.replyTo.trim()).filter(Boolean);
    const replyEmailsAllowed = [...new Set(replyEmailsRaw.map((e) => e.toLowerCase()))];

    let proposals: LlmAnalysisResult[] = [];
    try {
      proposals = await analyzeInboundSourcesWithLlm({
        tasks,
        emails,
        tenantId: null,
        allowedStageIds,
        odooTaskIds,
        replyEmailsAllowed,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const logLine = await tActionFill("aiAgentActions.logLlmFail", { msg });
      await appendAgentActivity(supabase, {
        userId: session.id,
        eventType: "scan_llm_error",
        message: logLine,
      });
      revalidatePath("/dashboard/ai-agent");
      return {
        ok: false,
        message: logLine,
        inserted: 0,
        taskCount,
        emailCount,
      };
    }

    const detail_json = {
      source: "inbound_scan",
      scan_at: new Date().toISOString(),
      allowedStageIds,
      odooTaskIds,
      replyEmailsAllowed,
    };

    let inserted = 0;
    for (const p of proposals) {
      if (
        p.proposed_action &&
        typeof p.proposed_action === "object" &&
        "type" in p.proposed_action &&
        (p.proposed_action as { type?: unknown }).type === "noop"
      ) {
        continue;
      }
      const rowDetail = enrichProposalDetailJson(detail_json, p.proposed_action, tasks, emailCount);
      const { data: ins, error } = await supabase
        .from("ai_agent_proposals")
        .insert({
          user_id: session.id,
          tenant_id: null,
          kind: p.kind,
          title: p.title,
          summary: p.summary,
          detail_json: rowDetail,
          proposed_action: p.proposed_action,
          status: "pending",
        })
        .select("id")
        .single();

      if (!error && ins) {
        inserted += 1;
        await appendAgentActivity(supabase, {
          userId: session.id,
          proposalId: ins.id,
          eventType: "proposed",
          message: await tActionFill("aiAgentActions.logScanProposal", { title: p.title }),
        });
      }
    }

    if (!inserted && (tasks.length > 0 || emails.length > 0)) {
      const hasAnyLlm =
        Boolean(process.env.GEMINI_API_KEY?.trim()) ||
        Boolean(process.env.GROQ_API_KEY?.trim()) ||
        Boolean(process.env.OPENAI_API_KEY?.trim());
      await appendAgentActivity(supabase, {
        userId: session.id,
        eventType: "scan_llm",
        message: hasAnyLlm
          ? await tAction("aiAgentActions.scanNoModelOutput")
          : await tAction("aiAgentActions.scanNoOpenAiKey"),
      });
    }

    await appendAgentActivity(supabase, {
      userId: session.id,
      eventType: "scan",
      message: await tActionFill("aiAgentActions.logScanComplete", {
        taskCount: String(taskCount),
        emailCount: String(emailCount),
        inserted: String(inserted),
      }),
    });

    revalidatePath("/dashboard/ai-agent");
    return {
      ok: true,
      message: await tActionFill("aiAgentActions.scanDoneSummary", {
        taskCount: String(taskCount),
        emailCount: String(emailCount),
        inserted: String(inserted),
      }),
      inserted,
      taskCount,
      emailCount,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      await appendAgentActivity(supabase, {
        userId: session.id,
        eventType: "scan_runtime_error",
        message: `فشل مسح المصادر قبل الاكتمال: ${msg}`,
      });
    } catch {
      // Ignore activity logging failures in fallback path.
    }
    revalidatePath("/dashboard/ai-agent");
    return {
      ok: false,
      message: `فشل المسح على الخادم: ${msg}`,
      inserted: 0,
      taskCount: 0,
      emailCount: 0,
    };
  }
}

export async function approveExecutionPlanAction(input: {
  proposalId: string;
  skippedStepIndexes: number[];
}): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const session = await requireSession();
  const supabase = await createClient();
  const res = await approveExecutionPlanState(supabase, {
    userId: session.id,
    proposalId: input.proposalId.trim(),
    skippedStepIndexes: input.skippedStepIndexes,
  });
  if (!res.ok) {
    return { ok: false, error: res.error };
  }
  revalidatePath("/dashboard/ai-agent");
  revalidatePath("/dashboard/chat");
  return { ok: true, message: await tAction("aiAgentActions.planApproved") };
}

export async function advanceExecutionPlanStepAction(
  proposalId: string
): Promise<{ ok: true; message: string; done: boolean } | { ok: false; error: string }> {
  const session = await requireSession();
  const supabase = await createClient();
  const res = await advanceExecutionPlanStep(supabase, {
    userId: session.id,
    proposalId: proposalId.trim(),
  });
  if (!res.ok) {
    return { ok: false, error: res.error };
  }
  revalidatePath("/dashboard/ai-agent");
  revalidatePath("/dashboard/chat");
  return { ok: true, message: res.message, done: res.done };
}

export async function listOdooTasksAction(input?: {
  text?: string;
  projectId?: number | null;
  stageId?: number | null;
  limit?: number;
  mineOnly?: boolean;
}): Promise<{ ok: true; tasks: Array<{ id: number; name: string; stage: string; project: string; deadline: string; creator: string; responsible: string; assigneeIds: number[]; description: string; priority: string; active: boolean }> } | { ok: false; error: string }> {
  const session = await requireSession();
  const supabase = await createClient();
  const mode = await loadOdooConnectionState(supabase, session.id);
  if (mode.mode !== "browser_session") {
    return { ok: false, error: "فعّل Browser Session Mode أولاً من إعدادات التكاملات." };
  }
  const bundle = await loadOdooBrowserSessionBundle(supabase, session.id);
  if (!bundle) {
    return { ok: false, error: "بيانات Odoo في Browser Session غير مكتملة." };
  }
  await appendAgentActivity(supabase, {
    userId: session.id,
    eventType: "odoo_call_start",
    message: "بدء قراءة مهام Odoo عبر Browser Session.",
  });
  const res = await searchOdooTasksViaWebLogin({
    bundle,
    text: input?.text,
    projectId: input?.projectId ?? null,
    stageId: input?.stageId ?? null,
    limit: input?.limit ?? 50,
    mineOnly: Boolean(input?.mineOnly ?? false),
  });
  if (res.error) {
    await appendAgentActivity(supabase, {
      userId: session.id,
      eventType: "odoo_call_fail",
      message: res.error,
    });
    return { ok: false, error: res.error };
  }
  await appendAgentActivity(supabase, {
    userId: session.id,
    eventType: "odoo_handshake_ok",
    message: `تمت قراءة مهام Odoo بنجاح (${res.tasks.length}).`,
  });
  return {
    ok: true,
    tasks: res.tasks.map((t) => ({
      id: t.id,
      name: t.name ?? "",
      stage: Array.isArray(t.stage_id) ? String(t.stage_id[1]) : "—",
      project: Array.isArray(t.project_id) ? String(t.project_id[1]) : "—",
      deadline: typeof t.date_deadline === "string" ? t.date_deadline : "—",
      creator: Array.isArray(t.create_uid) ? String(t.create_uid[1]) : "—",
      responsible: Array.isArray(t.user_id) ? String(t.user_id[1]) : "—",
      assigneeIds: Array.isArray(t.user_ids) ? t.user_ids.map(Number) : [],
      description: typeof t.description === "string" ? t.description : "",
      priority: typeof t.priority === "string" ? t.priority : "",
      active: Boolean(t.active ?? true),
    })),
  };
}

export async function updateOdooTaskStageAction(input: {
  taskId: number;
  stageId: number;
}): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const session = await requireSession();
  const supabase = await createClient();
  const mode = await loadOdooConnectionState(supabase, session.id);
  if (mode.mode !== "browser_session") {
    return { ok: false, error: "تحديث مهام Odoo عبر التطبيق متاح حالياً في Browser Session Mode." };
  }
  const bundle = await loadOdooBrowserSessionBundle(supabase, session.id);
  if (!bundle) return { ok: false, error: "بيانات Odoo غير مكتملة." };
  await appendAgentActivity(supabase, {
    userId: session.id,
    eventType: "odoo_call_start",
    message: `بدء تحديث مهمة Odoo #${input.taskId} إلى المرحلة ${input.stageId}.`,
  });
  const upd = await updateOdooTaskStageViaWebLogin({
    bundle,
    taskId: Number(input.taskId),
    stageId: Number(input.stageId),
  });
  if (!upd.ok) {
    await appendAgentActivity(supabase, {
      userId: session.id,
      eventType: "odoo_call_fail",
      message: upd.error,
    });
    return { ok: false, error: upd.error };
  }
  await appendAgentActivity(supabase, {
    userId: session.id,
    eventType: "odoo_action_success",
    message: `تم تحديث مهمة Odoo #${input.taskId} إلى المرحلة ${input.stageId}.`,
  });
  revalidatePath("/dashboard/ai-agent");
  return { ok: true, message: "تم تحديث مرحلة المهمة في Odoo بنجاح." };
}

export async function updateOdooTaskAction(input: {
  taskId: number;
  name?: string;
  description?: string;
  stageId?: number;
  deadline?: string;
  active?: boolean;
}): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const session = await requireSession();
  const supabase = await createClient();
  const bundle = await loadOdooBrowserSessionBundle(supabase, session.id);
  if (!bundle) return { ok: false, error: "بيانات Odoo غير مكتملة." };
  const upd = await updateOdooTaskViaWebLogin({
    bundle,
    taskId: Number(input.taskId),
    name: input.name,
    description: input.description,
    stageId: input.stageId,
    deadline: input.deadline,
    active: input.active,
  });
  if (!upd.ok) return upd;
  await appendAgentActivity(supabase, {
    userId: session.id,
    eventType: "odoo_action_success",
    message: `تم تعديل بيانات مهمة Odoo #${input.taskId}.`,
  });
  revalidatePath("/dashboard/ai-agent");
  return { ok: true, message: "تم تعديل المهمة بنجاح." };
}

export async function createOdooTaskAction(input: {
  title: string;
  description?: string;
  projectId?: number | null;
  stageId?: number | null;
}): Promise<{ ok: true; message: string; taskId: number } | { ok: false; error: string }> {
  const session = await requireSession();
  const supabase = await createClient();
  const mode = await loadOdooConnectionState(supabase, session.id);
  if (mode.mode !== "browser_session") {
    return { ok: false, error: "إنشاء مهام Odoo عبر التطبيق متاح حالياً في Browser Session Mode." };
  }
  const bundle = await loadOdooBrowserSessionBundle(supabase, session.id);
  if (!bundle) return { ok: false, error: "بيانات Odoo غير مكتملة." };
  await appendAgentActivity(supabase, {
    userId: session.id,
    eventType: "odoo_call_start",
    message: `بدء إنشاء مهمة Odoo بعنوان: ${String(input.title ?? "").trim()}`,
  });
  const created = await createOdooTaskViaWebLogin({
    bundle,
    title: String(input.title ?? "").trim(),
    description: input.description ?? null,
    projectId: input.projectId ?? null,
    stageId: input.stageId ?? null,
  });
  if (!created.ok) {
    await appendAgentActivity(supabase, {
      userId: session.id,
      eventType: "odoo_call_fail",
      message: created.error,
    });
    return { ok: false, error: created.error };
  }
  await appendAgentActivity(supabase, {
    userId: session.id,
    eventType: "odoo_action_success",
    message: `تم إنشاء مهمة Odoo جديدة (#${created.taskId}) بعنوان: ${String(input.title ?? "").trim()}`,
  });
  revalidatePath("/dashboard/ai-agent");
  return { ok: true, message: "تم إنشاء المهمة في Odoo بنجاح.", taskId: created.taskId };
}

export async function listOdooProjectsAction(input?: {
  text?: string;
  limit?: number;
  mineOnly?: boolean;
}): Promise<{ ok: true; projects: Array<{ id: number; name: string; active: boolean; creator: string; manager: string; visibility: string; createdAt: string }> } | { ok: false; error: string }> {
  const session = await requireSession();
  const supabase = await createClient();
  const mode = await loadOdooConnectionState(supabase, session.id);
  if (mode.mode !== "browser_session") {
    return { ok: false, error: "فعّل Browser Session Mode أولاً من إعدادات التكاملات." };
  }
  const bundle = await loadOdooBrowserSessionBundle(supabase, session.id);
  if (!bundle) return { ok: false, error: "بيانات Odoo غير مكتملة." };
  const res = await listOdooProjectsViaWebLogin({
    bundle,
    text: input?.text,
    limit: input?.limit ?? 80,
    mineOnly: Boolean(input?.mineOnly ?? false),
  });
  if (res.error) return { ok: false, error: res.error };
  await appendAgentActivity(supabase, {
    userId: session.id,
    eventType: "odoo_sync_projects",
    message: `تمت مزامنة ${res.projects.length} مشروع من Odoo.`,
  });
  return {
    ok: true,
    projects: res.projects.map((p) => ({
      id: p.id,
      name: p.name,
      active: Boolean(p.active ?? true),
      creator: Array.isArray(p.create_uid) ? String(p.create_uid[1]) : "—",
      manager: Array.isArray(p.user_id) ? String(p.user_id[1]) : "—",
      visibility: typeof p.privacy_visibility === "string" ? p.privacy_visibility : "—",
      createdAt: typeof p.create_date === "string" ? p.create_date : "",
    })),
  };
}

export async function createOdooProjectAction(input: {
  name: string;
}): Promise<{ ok: true; projectId: number; message: string } | { ok: false; error: string }> {
  const session = await requireSession();
  const supabase = await createClient();
  const bundle = await loadOdooBrowserSessionBundle(supabase, session.id);
  if (!bundle) return { ok: false, error: "بيانات Odoo غير مكتملة." };
  const created = await createOdooProjectViaWebLogin({ bundle, name: String(input.name ?? "").trim() });
  if (!created.ok) return created;
  await appendAgentActivity(supabase, {
    userId: session.id,
    eventType: "odoo_action_success",
    message: `تم إنشاء مشروع Odoo جديد (#${created.projectId})`,
  });
  revalidatePath("/dashboard/ai-agent");
  return { ok: true, projectId: created.projectId, message: "تم إنشاء المشروع في Odoo بنجاح." };
}

export async function updateOdooProjectAction(input: {
  projectId: number;
  name?: string;
  active?: boolean;
}): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const session = await requireSession();
  const supabase = await createClient();
  const bundle = await loadOdooBrowserSessionBundle(supabase, session.id);
  if (!bundle) return { ok: false, error: "بيانات Odoo غير مكتملة." };
  const upd = await updateOdooProjectViaWebLogin({
    bundle,
    projectId: Number(input.projectId),
    name: input.name,
    active: input.active,
  });
  if (!upd.ok) return upd;
  revalidatePath("/dashboard/ai-agent");
  return { ok: true, message: "تم تحديث المشروع في Odoo." };
}

export type OdooCalendarEventRow = {
  id: number;
  name: string;
  start: string;
  stop: string;
  allday: boolean;
  creator: string;
  responsible: string;
  responsibleId?: number;
  partnerIds: number[];
  location: string;
  description: string;
  active: boolean;
  resModel: string;
  resId: number | null;
  agendaLines: Array<{ id: number; summary: string; note: string; state: string; dateDeadline: string }>;
  /** `calendar.event.agenda.item` (Odoo.sh agenda tab). */
  agendaItems: Array<{
    id: number;
    sequence: number;
    name: string;
    description: string;
    discussed: boolean;
  }>;
};

export async function listOdooCalendarEventsAction(input?: {
  text?: string;
  limit?: number;
  mineOnly?: boolean;
  startFrom?: string;
  startBefore?: string;
  /** Default true. Set false for month/day bulk lists to avoid Netlify timeouts. */
  includeAgendaDetails?: boolean;
}): Promise<{ ok: true; events: OdooCalendarEventRow[] } | { ok: false; error: string }> {
  const session = await requireSession();
  const supabase = await createClient();
  const bundle = await loadOdooBrowserSessionBundle(supabase, session.id);
  if (!bundle) return { ok: false, error: "بيانات Odoo غير مكتملة." };
  const res = await listOdooCalendarEventsViaWebLogin({
    bundle,
    text: input?.text,
    limit: input?.limit ?? 120,
    mineOnly: Boolean(input?.mineOnly ?? false),
    startFrom: input?.startFrom,
    startBefore: input?.startBefore,
    includeAgendaDetails: input?.includeAgendaDetails !== false,
  });
  if (res.error) return { ok: false, error: res.error };
  return {
    ok: true,
    events: res.events.map((e) => ({
      id: e.id,
      name: e.name,
      start: String(e.start ?? ""),
      stop: String(e.stop ?? ""),
      allday: Boolean(e.allday ?? false),
      creator: Array.isArray(e.create_uid) ? String(e.create_uid[1]) : "—",
      responsible: Array.isArray(e.user_id) ? String(e.user_id[1]) : "—",
      responsibleId: Array.isArray(e.user_id) ? Number(e.user_id[0]) : undefined,
      partnerIds: Array.isArray(e.partner_ids) ? e.partner_ids.map(Number) : [],
      location: typeof e.location === "string" ? e.location : "",
      description: typeof e.description === "string" ? e.description : "",
      active: Boolean(e.active ?? true),
      resModel: typeof e.res_model === "string" ? e.res_model : "",
      resId: typeof e.res_id === "number" && Number.isFinite(e.res_id) ? e.res_id : null,
      agendaLines: Array.isArray(e.agendaLines)
        ? e.agendaLines.map((a) => ({
            id: a.id,
            summary: a.summary,
            note: a.notePlain,
            state: a.state,
            dateDeadline: a.dateDeadline,
          }))
        : [],
      agendaItems: Array.isArray(e.agendaItems)
        ? e.agendaItems.map((it) => ({
            id: it.id,
            sequence: it.sequence,
            name: it.name,
            description: it.descriptionPlain,
            discussed: it.discussed,
          }))
        : [],
    })),
  };
}

export async function listOdooCalendarEventsMonthAction(input: {
  yearMonth: string;
  mineOnly?: boolean;
}): Promise<{ ok: true; events: OdooCalendarEventRow[] } | { ok: false; error: string }> {
  const ym = String(input.yearMonth || "").trim();
  if (!/^\d{4}-\d{2}$/.test(ym)) {
    return { ok: false, error: "صيغة الشهر غير صحيحة. استخدم YYYY-MM." };
  }
  const [y, m] = ym.split("-").map(Number);
  const start = `${ym}-01 00:00:00`;
  const nextMonth = new Date(y, m, 1);
  const end = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01 00:00:00`;
  return listOdooCalendarEventsAction({
    limit: 500,
    mineOnly: Boolean(input.mineOnly ?? false),
    startFrom: start,
    startBefore: end,
    includeAgendaDetails: false,
  });
}

export async function listOdooCalendarEventsDayAction(input: {
  day: string;
  mineOnly?: boolean;
}): Promise<{ ok: true; events: OdooCalendarEventRow[] } | { ok: false; error: string }> {
  const day = String(input.day || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return { ok: false, error: "صيغة اليوم غير صحيحة. استخدم YYYY-MM-DD." };
  }
  const [y, m, d] = day.split("-").map(Number);
  const start = `${day} 00:00:00`;
  const nextDay = new Date(y, m - 1, d + 1);
  const end = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, "0")}-${String(nextDay.getDate()).padStart(2, "0")} 00:00:00`;
  return listOdooCalendarEventsAction({
    limit: 800,
    mineOnly: Boolean(input.mineOnly ?? false),
    startFrom: start,
    startBefore: end,
    includeAgendaDetails: false,
  });
}

export async function createOdooCalendarEventAction(input: {
  name: string;
  start: string;
  stop: string;
  allday?: boolean;
}): Promise<{ ok: true; eventId: number; message: string } | { ok: false; error: string }> {
  const session = await requireSession();
  const supabase = await createClient();
  const bundle = await loadOdooBrowserSessionBundle(supabase, session.id);
  if (!bundle) return { ok: false, error: "بيانات Odoo غير مكتملة." };
  const created = await createOdooCalendarEventViaWebLogin({
    bundle,
    name: input.name,
    start: input.start,
    stop: input.stop,
    allday: input.allday,
  });
  if (!created.ok) return created;
  revalidatePath("/dashboard/ai-agent");
  return { ok: true, eventId: created.eventId, message: "تم إنشاء حدث التقويم في Odoo بنجاح." };
}

export async function cloneOdooCalendarEventsAction(input: {
  events: Array<{
    eventId: number;
    name: string;
    start: string;
    stop: string;
    allday?: boolean;
    description?: string;
    location?: string;
    partnerIds?: number[];
    responsibleId?: number;
  }>;
}): Promise<{
  ok: true;
  copied: number;
  failed: number;
  agendaActivitiesCreated: number;
  agendaTableItemsCreated: number;
  agendaDescriptionFallbackCount: number;
  message: string;
} | { ok: false; error: string }> {
  const session = await requireSession();
  const supabase = await createClient();
  const bundle = await loadOdooBrowserSessionBundle(supabase, session.id);
  if (!bundle) return { ok: false, error: "بيانات Odoo غير مكتملة." };
  const rows = Array.isArray(input.events) ? input.events : [];
  if (!rows.length) return { ok: false, error: "اختر حدثًا واحدًا على الأقل." };

  let copied = 0;
  let failed = 0;
  let agendaActivitiesCreated = 0;
  let agendaTableItemsCreated = 0;
  let agendaDescriptionFallbackCount = 0;

  for (const row of rows) {
    const cloned = await copyOdooCalendarEventViaWebLogin({
      bundle,
      eventId: Number(row.eventId),
      name: row.name,
      start: row.start,
      stop: row.stop,
      allday: row.allday,
      description: row.description,
      location: row.location,
      partnerIds: row.partnerIds,
      userId: row.responsibleId,
    });
    let newEventId: number | null = null;
    if (cloned.ok) {
      newEventId = cloned.eventId;
    } else {
      // Fallback for tenants where copy is blocked by model rules.
      const created = await createOdooCalendarEventViaWebLogin({
        bundle,
        name: row.name,
        start: row.start,
        stop: row.stop,
        allday: row.allday,
        description: row.description,
        location: row.location,
        partnerIds: row.partnerIds,
        userId: row.responsibleId,
      });
      if (created.ok) newEventId = created.eventId;
      else failed += 1;
    }

    if (newEventId) {
      copied += 1;
      const dup = await duplicateCalendarMeetingAgendaViaWebLogin({
        bundle,
        sourceEventId: Number(row.eventId),
        targetEventId: newEventId,
        targetEventStart: row.start,
        targetDescriptionForFallback: row.description,
      });
      agendaActivitiesCreated += dup.created;
      agendaTableItemsCreated += dup.agendaItemsCreated;
      if (dup.fallbackDescriptionUpdated) agendaDescriptionFallbackCount += 1;
    }
  }

  revalidatePath("/dashboard/ai-agent");
  const agendaBits: string[] = [];
  if (agendaTableItemsCreated > 0) {
    agendaBits.push(`تم إنشاء ${agendaTableItemsCreated} سطرًا في جدول الأجندة (Odoo)`);
  }
  if (agendaActivitiesCreated > 0) {
    agendaBits.push(`تم إنشاء ${agendaActivitiesCreated} نشاطًا بريديًا مرتبطًا بالاجتماع`);
  }
  const agendaRich = agendaBits.length ? ` ${agendaBits.join("، ")}.` : "";
  const agendaPart =
    agendaBits.length > 0
      ? agendaRich
      : agendaDescriptionFallbackCount > 0
        ? ` وتم لصق نص الأجندة في الوصف لـ ${agendaDescriptionFallbackCount} حدث (تعذّر نسخ بنود الأجندة آلياً في Odoo).`
        : "";
  return {
    ok: true,
    copied,
    failed,
    agendaActivitiesCreated,
    agendaTableItemsCreated,
    agendaDescriptionFallbackCount,
    message: `تم نسخ ${copied} حدث${failed ? `، وفشل ${failed}` : ""}.${agendaPart}`,
  };
}

export async function updateOdooCalendarEventAction(input: {
  eventId: number;
  name?: string;
  start?: string;
  stop?: string;
  allday?: boolean;
}): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const session = await requireSession();
  const supabase = await createClient();
  const bundle = await loadOdooBrowserSessionBundle(supabase, session.id);
  if (!bundle) return { ok: false, error: "بيانات Odoo غير مكتملة." };
  const upd = await updateOdooCalendarEventViaWebLogin({
    bundle,
    eventId: Number(input.eventId),
    name: input.name,
    start: input.start,
    stop: input.stop,
    allday: input.allday,
  });
  if (!upd.ok) return upd;
  revalidatePath("/dashboard/ai-agent");
  return { ok: true, message: "تم تحديث حدث التقويم في Odoo." };
}

export async function listOdooDocumentsAction(input?: {
  text?: string;
  limit?: number;
  mineOnly?: boolean;
}): Promise<{ ok: true; documents: Array<{ id: number; name: string; type: string; createdAt: string; creator: string }> } | { ok: false; error: string }> {
  const session = await requireSession();
  const supabase = await createClient();
  const bundle = await loadOdooBrowserSessionBundle(supabase, session.id);
  if (!bundle) return { ok: false, error: "بيانات Odoo غير مكتملة." };
  const res = await listOdooDocumentsViaWebLogin({
    bundle,
    text: input?.text,
    limit: input?.limit ?? 80,
    mineOnly: Boolean(input?.mineOnly ?? false),
  });
  if (res.error) return { ok: false, error: res.error };
  await appendAgentActivity(supabase, {
    userId: session.id,
    eventType: "odoo_sync_documents",
    message: `تمت مزامنة ${res.documents.length} مستند من Odoo.`,
  });
  return {
    ok: true,
    documents: res.documents.map((d) => ({
      id: d.id,
      name: d.name,
      type: String(d.type ?? ""),
      createdAt: String(d.create_date ?? ""),
      creator: Array.isArray(d.create_uid) ? String(d.create_uid[1]) : "—",
    })),
  };
}

export async function listOdooWorkspaceAllAction(input?: {
  text?: string;
  mineOnly?: boolean;
}): Promise<
  | {
      ok: true;
      tasks: Array<{ id: number; name: string; stage: string; project: string; deadline: string; creator: string; responsible: string; assigneeIds: number[]; description: string; priority: string; active: boolean }>;
      projects: Array<{ id: number; name: string; active: boolean; creator: string; manager: string; visibility: string; createdAt: string }>;
      events: OdooCalendarEventRow[];
      documents: Array<{ id: number; name: string; type: string; createdAt: string; creator: string }>;
    }
  | { ok: false; error: string }
> {
  const [tasks, projects, events, documents] = await Promise.all([
    listOdooTasksAction({ text: input?.text, limit: 60, mineOnly: input?.mineOnly }),
    listOdooProjectsAction({ text: input?.text, limit: 100, mineOnly: input?.mineOnly }),
    listOdooCalendarEventsAction({ text: input?.text, limit: 100, mineOnly: input?.mineOnly }),
    listOdooDocumentsAction({ text: input?.text, limit: 100, mineOnly: input?.mineOnly }),
  ]);
  if (!tasks.ok) return tasks;
  if (!projects.ok) return projects;
  if (!events.ok) return events;
  if (!documents.ok) return documents;
  return {
    ok: true,
    tasks: tasks.tasks,
    projects: projects.projects,
    events: events.events,
    documents: documents.documents,
  };
}

export async function archiveOdooEntityAction(input: {
  model: "project.task" | "project.project" | "calendar.event" | "documents.document" | "ir.attachment";
  id: number;
}): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const session = await requireSession();
  const supabase = await createClient();
  const bundle = await loadOdooBrowserSessionBundle(supabase, session.id);
  if (!bundle) return { ok: false, error: "بيانات Odoo غير مكتملة." };
  const res = await archiveOdooRecordViaWebLogin({
    bundle,
    model: input.model,
    id: Number(input.id),
  });
  if (!res.ok) return res;
  await appendAgentActivity(supabase, {
    userId: session.id,
    eventType: "odoo_action_success",
    message: `تمت أرشفة ${input.model}#${input.id}`,
  });
  revalidatePath("/dashboard/ai-agent");
  return { ok: true, message: "تمت الأرشفة بنجاح." };
}

export async function deleteOdooEntityAction(input: {
  model: "project.task" | "project.project" | "calendar.event" | "documents.document" | "ir.attachment";
  id: number;
}): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const session = await requireSession();
  const supabase = await createClient();
  const bundle = await loadOdooBrowserSessionBundle(supabase, session.id);
  if (!bundle) return { ok: false, error: "بيانات Odoo غير مكتملة." };
  const res = await deleteOdooRecordViaWebLogin({
    bundle,
    model: input.model,
    id: Number(input.id),
  });
  if (!res.ok) return res;
  await appendAgentActivity(supabase, {
    userId: session.id,
    eventType: "odoo_action_success",
    message: `تم حذف ${input.model}#${input.id}`,
  });
  revalidatePath("/dashboard/ai-agent");
  return { ok: true, message: "تم الحذف بنجاح." };
}

export async function createOdooDocumentAction(input: {
  name: string;
}): Promise<{ ok: true; documentId: number; message: string } | { ok: false; error: string }> {
  const session = await requireSession();
  const supabase = await createClient();
  const bundle = await loadOdooBrowserSessionBundle(supabase, session.id);
  if (!bundle) return { ok: false, error: "بيانات Odoo غير مكتملة." };
  const created = await createOdooDocumentViaWebLogin({ bundle, name: input.name });
  if (!created.ok) return created;
  revalidatePath("/dashboard/ai-agent");
  return { ok: true, documentId: created.documentId, message: "تم إنشاء مستند Odoo بنجاح." };
}

export async function updateOdooDocumentAction(input: {
  documentId: number;
  name: string;
}): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const session = await requireSession();
  const supabase = await createClient();
  const bundle = await loadOdooBrowserSessionBundle(supabase, session.id);
  if (!bundle) return { ok: false, error: "بيانات Odoo غير مكتملة." };
  const upd = await updateOdooDocumentViaWebLogin({
    bundle,
    documentId: Number(input.documentId),
    name: input.name,
  });
  if (!upd.ok) return upd;
  revalidatePath("/dashboard/ai-agent");
  return { ok: true, message: "تم تحديث المستند في Odoo." };
}

export async function exportOdooWorkspaceExcelAction(): Promise<
  { ok: true; fileName: string; base64: string } | { ok: false; error: string }
> {
  const session = await requireSession();
  const supabase = await createClient();
  const bundle = await loadOdooBrowserSessionBundle(supabase, session.id);
  if (!bundle) return { ok: false, error: "بيانات Odoo غير مكتملة." };

  const [tasksRes, projectsRes, eventsRes, docsRes] = await Promise.all([
    searchOdooTasksViaWebLogin({ bundle, limit: 500 }),
    listOdooProjectsViaWebLogin({ bundle, limit: 500 }),
    listOdooCalendarEventsViaWebLogin({ bundle, limit: 500, includeAgendaDetails: false }),
    listOdooDocumentsViaWebLogin({ bundle, limit: 500 }),
  ]);

  if (tasksRes.error) return { ok: false, error: tasksRes.error };
  if (projectsRes.error) return { ok: false, error: projectsRes.error };
  if (eventsRes.error) return { ok: false, error: eventsRes.error };
  if (docsRes.error) return { ok: false, error: docsRes.error };

  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Odoo Control Center";

  const wsTasks = wb.addWorksheet("Tasks");
  wsTasks.addRow(["id", "name", "project", "stage", "deadline"]);
  tasksRes.tasks.forEach((t) => {
    wsTasks.addRow([
      t.id,
      t.name ?? "",
      Array.isArray(t.project_id) ? t.project_id[1] : "",
      Array.isArray(t.stage_id) ? t.stage_id[1] : "",
      typeof t.date_deadline === "string" ? t.date_deadline : "",
    ]);
  });

  const wsProjects = wb.addWorksheet("Projects");
  wsProjects.addRow(["id", "name", "active", "create_date"]);
  projectsRes.projects.forEach((p) => wsProjects.addRow([p.id, p.name, p.active ? 1 : 0, p.create_date ?? ""]));

  const wsEvents = wb.addWorksheet("Calendar");
  wsEvents.addRow(["id", "name", "start", "stop", "allday"]);
  eventsRes.events.forEach((e) => wsEvents.addRow([e.id, e.name, e.start ?? "", e.stop ?? "", e.allday ? 1 : 0]));

  const wsDocs = wb.addWorksheet("Documents");
  wsDocs.addRow(["id", "name", "type", "mimetype", "create_date"]);
  docsRes.documents.forEach((d) =>
    wsDocs.addRow([d.id, d.name, d.type ?? "", typeof d.mimetype === "string" ? d.mimetype : "", d.create_date ?? ""])
  );

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return {
    ok: true,
    fileName: `odoo-workspace-${new Date().toISOString().slice(0, 10)}.xlsx`,
    base64: buffer.toString("base64"),
  };
}

export async function importOdooWorkspaceExcelAction(input: {
  base64: string;
}): Promise<{ ok: true; message: string; created: Record<string, number> } | { ok: false; error: string }> {
  const session = await requireSession();
  const supabase = await createClient();
  const bundle = await loadOdooBrowserSessionBundle(supabase, session.id);
  if (!bundle) return { ok: false, error: "بيانات Odoo غير مكتملة." };
  if (!input.base64?.trim()) return { ok: false, error: "ملف Excel غير صالح." };

  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await (wb.xlsx as unknown as { load: (data: unknown) => Promise<void> }).load(
    Buffer.from(input.base64, "base64")
  );

  const created = { tasks: 0, projects: 0, calendar: 0, documents: 0 };

  const taskSheet = wb.getWorksheet("Tasks");
  if (taskSheet) {
    for (let i = 2; i <= taskSheet.rowCount; i++) {
      const row = taskSheet.getRow(i);
      const title = String(row.getCell(2).value ?? "").trim();
      if (!title) continue;
      const out = await createOdooTaskViaWebLogin({ bundle, title });
      if (out.ok) created.tasks += 1;
    }
  }

  const projectSheet = wb.getWorksheet("Projects");
  if (projectSheet) {
    for (let i = 2; i <= projectSheet.rowCount; i++) {
      const row = projectSheet.getRow(i);
      const name = String(row.getCell(2).value ?? "").trim();
      if (!name) continue;
      const out = await createOdooProjectViaWebLogin({ bundle, name });
      if (out.ok) created.projects += 1;
    }
  }

  const calendarSheet = wb.getWorksheet("Calendar");
  if (calendarSheet) {
    for (let i = 2; i <= calendarSheet.rowCount; i++) {
      const row = calendarSheet.getRow(i);
      const name = String(row.getCell(2).value ?? "").trim();
      const start = String(row.getCell(3).value ?? "").trim();
      const stop = String(row.getCell(4).value ?? "").trim();
      const alldayRaw = String(row.getCell(5).value ?? "").trim();
      if (!name || !start || !stop) continue;
      const out = await createOdooCalendarEventViaWebLogin({
        bundle,
        name,
        start,
        stop,
        allday: alldayRaw === "1" || alldayRaw.toLowerCase() === "true",
      });
      if (out.ok) created.calendar += 1;
    }
  }

  const docsSheet = wb.getWorksheet("Documents");
  if (docsSheet) {
    for (let i = 2; i <= docsSheet.rowCount; i++) {
      const row = docsSheet.getRow(i);
      const name = String(row.getCell(2).value ?? "").trim();
      if (!name) continue;
      const out = await createOdooDocumentViaWebLogin({ bundle, name });
      if (out.ok) created.documents += 1;
    }
  }

  revalidatePath("/dashboard/ai-agent");
  return {
    ok: true,
    message: `تم الاستيراد: مهام ${created.tasks}، مشاريع ${created.projects}، تقويم ${created.calendar}، مستندات ${created.documents}.`,
    created,
  };
}
