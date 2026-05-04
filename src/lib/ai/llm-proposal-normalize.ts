import type { ProposalKind, ProposedActionPayload } from "@/lib/ai-agent/proposal-types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function coerceKind(k: unknown): ProposalKind {
  const allowed: ProposalKind[] = [
    "email_reply",
    "task_create",
    "odoo_sync",
    "generic",
    "analysis",
  ];
  if (typeof k === "string" && (allowed as string[]).includes(k)) {
    return k as ProposalKind;
  }
  return "generic";
}

export function normalizeProposedAction(a: unknown): ProposedActionPayload {
  if (!isRecord(a) || typeof a.type !== "string") {
    return { type: "noop" };
  }
  switch (a.type) {
    case "noop":
      return { type: "noop" };
    case "create_corporate_task": {
      const tenantId = typeof a.tenantId === "string" ? a.tenantId : "";
      const title = typeof a.title === "string" ? a.title : "";
      const dueOn = typeof a.dueOn === "string" ? a.dueOn : "";
      if (!tenantId || !title || !dueOn) return { type: "noop" };
      return {
        type: "create_corporate_task",
        tenantId,
        title,
        dueOn,
        notes: typeof a.notes === "string" ? a.notes : null,
        assigneeId:
          typeof a.assigneeId === "string" && a.assigneeId.trim()
            ? a.assigneeId.trim()
            : null,
      };
    }
    case "email_reply_placeholder":
      return {
        type: "email_reply_placeholder",
        threadKey: typeof a.threadKey === "string" ? a.threadKey : undefined,
        draftBody: typeof a.draftBody === "string" ? a.draftBody : undefined,
      };
    case "odoo_placeholder":
      return {
        type: "odoo_placeholder",
        description: typeof a.description === "string" ? a.description : undefined,
      };
    case "send_email_reply": {
      const to = typeof a.to === "string" ? a.to.trim() : "";
      const subject = typeof a.subject === "string" ? a.subject.trim() : "";
      const body = typeof a.body === "string" ? a.body : "";
      if (!to || !subject || !body.trim()) return { type: "noop" };
      return {
        type: "send_email_reply",
        to,
        subject,
        body,
        inReplyTo:
          typeof a.inReplyTo === "string" && a.inReplyTo.trim() ? a.inReplyTo.trim() : null,
        references:
          typeof a.references === "string" && a.references.trim()
            ? a.references.trim()
            : null,
      };
    }
    case "odoo_update_task": {
      const taskId = Number(a.taskId);
      const stageId = Number(a.stageId);
      if (!Number.isFinite(taskId) || !Number.isFinite(stageId)) {
        return { type: "noop" };
      }
      return { type: "odoo_update_task", taskId, stageId };
    }
    case "execution_plan": {
      const intent = typeof a.intent === "string" ? a.intent : "combined";
      const rawSteps = Array.isArray(a.steps) ? a.steps : [];
      const steps: Array<{
        tool: string;
        description: string;
        requiresApproval: boolean;
        fallback: string;
      }> = [];
      for (const s of rawSteps) {
        if (!isRecord(s)) continue;
        const tool = typeof s.tool === "string" ? s.tool : "";
        const description = typeof s.description === "string" ? s.description : "";
        const fallback = typeof s.fallback === "string" ? s.fallback : "";
        if (!tool || !description) continue;
        steps.push({
          tool,
          description,
          requiresApproval: Boolean(s.requiresApproval),
          fallback,
        });
      }
      if (!steps.length) return { type: "noop" };
      return { type: "execution_plan", intent, steps };
    }
    default:
      return { type: "noop" };
  }
}
