/**
 * Shapes stored in ai_agent_proposals.proposed_action (JSON).
 * Executor runs server-side only after explicit user approval.
 */
export type ProposedActionPayload =
  | { type: "noop" }
  | {
      type: "create_corporate_task";
      tenantId: string;
      title: string;
      dueOn: string;
      notes?: string | null;
      assigneeId?: string | null;
    }
  | {
      type: "email_reply_placeholder";
      /** Opaque id for future IMAP thread binding */
      threadKey?: string;
      draftBody?: string;
    }
  | {
      type: "odoo_placeholder";
      description?: string;
    }
  | {
      type: "send_email_reply";
      to: string;
      subject: string;
      body: string;
      inReplyTo?: string | null;
      references?: string | null;
    }
  | {
      type: "odoo_update_task";
      taskId: number;
      stageId: number;
    }
  | {
      type: "update_company_document_expiry";
      documentId: string;
      tenantId: string;
      documentName: string;
      oldExpiry: string;
      newExpiry: string;
    }
  | {
      type: "create_personal_reminder";
      title: string;
      remindAt: string;
      recurrence: "once" | "daily" | "weekly";
      soundEnabled: boolean;
      emailEnabled: boolean;
    }
  | {
      type: "execution_plan";
      intent: string;
      steps: Array<{
        tool: string;
        description: string;
        requiresApproval: boolean;
        fallback: string;
      }>;
    };

export type ProposalKind =
  | "email_reply"
  | "task_create"
  | "odoo_sync"
  | "generic"
  | "analysis";
