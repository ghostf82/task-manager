"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { analyzeFreeTextWithLlm } from "@/lib/ai/llm-analyze";
import { analyzeInboundSourcesWithLlm } from "@/lib/ai/llm-inbound";
import type { LlmAnalysisResult } from "@/lib/ai/llm-analyze";
import { appendAgentActivity } from "@/lib/ai-agent/activity-log";
import { executeApprovedProposal } from "@/lib/ai-agent/execute-proposal";
import type { ProposedActionPayload } from "@/lib/ai-agent/proposal-types";
import { collectLicensedInboundData } from "@/lib/ai-tools/collect-licensed-inbound";
import { getLicensedActiveToolSlugs } from "@/lib/ai-tools/user-licenses";
import { requireSession } from "@/lib/dashboard-auth";
import { tAction, tActionFill } from "@/lib/i18n/action-messages";
import type { OdooTaskRecord } from "@/lib/integrations/odoo-xmlrpc";
import { createClient } from "@/lib/supabase/server";

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

  let analysis;
  try {
    analysis = await analyzeFreeTextWithLlm({ text, tenantId });
  } catch (e) {
    console.error("analyzeFreeTextWithLlm", e);
    redirect("/dashboard/ai-agent?err=llm");
  }

  const supabase = await createClient();
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
    await appendAgentActivity(supabase, {
      userId: session.id,
      eventType: "scan_llm",
      message: process.env.OPENAI_API_KEY?.trim()
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
}
