"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { confirmProposalExecutionAction } from "@/app/dashboard/ai-agent/actions";
import type { PendingProposalRow } from "@/app/dashboard/ai-agent/pending-proposals-panel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function actionType(pa: unknown): string {
  if (isRecord(pa) && typeof pa.type === "string") return pa.type;
  return "";
}

function readOdooPreview(detail: unknown): {
  taskName: string;
  currentStageName: string;
  targetStageName: string;
} | null {
  if (!isRecord(detail) || !isRecord(detail.odooPreview)) return null;
  const o = detail.odooPreview as Record<string, unknown>;
  return {
    taskName: typeof o.taskName === "string" ? o.taskName : "—",
    currentStageName: typeof o.currentStageName === "string" ? o.currentStageName : "—",
    targetStageName: typeof o.targetStageName === "string" ? o.targetStageName : "—",
  };
}

export function AiProposalReviewDialog({
  proposal,
  open,
  onOpenChange,
  onResolved,
}: {
  proposal: PendingProposalRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolved: () => void;
}) {
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [confirming, startConfirm] = useTransition();

  const dialogAction = proposal ? actionType(proposal.proposed_action) : null;
  const odooPreview = proposal ? readOdooPreview(proposal.detail_json) : null;

  useEffect(() => {
    if (!open || !proposal) return;
    const pa = proposal.proposed_action;
    const t = actionType(pa);
    if (t === "send_email_reply" && isRecord(pa)) {
      setEmailSubject(typeof pa.subject === "string" ? pa.subject : "");
      setEmailBody(typeof pa.body === "string" ? pa.body : "");
    } else {
      setEmailSubject("");
      setEmailBody("");
    }
  }, [open, proposal]);

  function confirmExecution() {
    if (!proposal) return;
    const id = proposal.id;
    const t = actionType(proposal.proposed_action);
    if (t === "send_email_reply" && !emailBody.trim()) {
      toast.error("نص الرسالة مطلوب قبل الإرسال.");
      return;
    }
    startConfirm(async () => {
      const res = await confirmProposalExecutionAction({
        proposalId: id,
        emailBody: t === "send_email_reply" ? emailBody : undefined,
        emailSubject: t === "send_email_reply" ? emailSubject : undefined,
      });
      if (res.ok) {
        toast.success(res.message);
        onOpenChange(false);
        onResolved();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="max-h-[min(90vh,640px)] overflow-y-auto sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle className="text-start leading-snug">مراجعة قبل التنفيذ</DialogTitle>
          <DialogDescription className="text-start">{proposal?.title}</DialogDescription>
        </DialogHeader>

        {proposal && dialogAction === "send_email_reply" ? (
          <div className="grid gap-4 rounded-lg border border-border/60 bg-muted/20 p-4">
            <p className="text-muted-foreground text-xs leading-relaxed">
              مسودة الرد — عدّل النص أو العنوان ثم أكّد الإرسال عبر SMTP من الخادم.
            </p>
            <div className="grid gap-2">
              <Label htmlFor="ai-rev-to">إلى</Label>
              <Input
                id="ai-rev-to"
                readOnly
                dir="ltr"
                className="font-mono text-xs"
                value={
                  isRecord(proposal.proposed_action) &&
                  typeof proposal.proposed_action.to === "string"
                    ? proposal.proposed_action.to
                    : ""
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ai-rev-subject">الموضوع</Label>
              <Input
                id="ai-rev-subject"
                dir="ltr"
                className="font-mono text-sm"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ai-rev-body">نص الرسالة</Label>
              <Textarea
                id="ai-rev-body"
                rows={10}
                className="min-h-[180px] resize-y text-sm leading-relaxed"
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
              />
            </div>
          </div>
        ) : null}

        {proposal && dialogAction === "odoo_update_task" ? (
          <div className="grid gap-3 rounded-lg border border-border/60 bg-muted/20 p-4 text-sm">
            <div className="flex justify-between gap-4 border-b border-border/50 pb-2">
              <span className="text-muted-foreground">المهمة</span>
              <span className="max-w-[60%] text-start font-medium">
                {odooPreview?.taskName ?? "—"}
              </span>
            </div>
            <div className="flex justify-between gap-4 border-b border-border/50 pb-2">
              <span className="text-muted-foreground">المرحلة الحالية</span>
              <span className="max-w-[60%] text-start">{odooPreview?.currentStageName ?? "—"}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">المرحلة بعد التنفيذ</span>
              <span className="max-w-[60%] text-start font-medium text-emerald-700 dark:text-emerald-300">
                {odooPreview?.targetStageName ?? "—"}
              </span>
            </div>
          </div>
        ) : null}

        {proposal &&
        dialogAction &&
        dialogAction !== "send_email_reply" &&
        dialogAction !== "odoo_update_task" ? (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm leading-relaxed">
            <p className="font-medium text-amber-900 dark:text-amber-200">ملخص الإجراء</p>
            <p className="text-muted-foreground mt-1 text-xs">{proposal.summary}</p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              نوع الإجراء:{" "}
              <span className="font-mono [direction:ltr]">{dialogAction}</span>
            </p>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button type="button" disabled={confirming} onClick={confirmExecution} className="gap-2">
            {confirming ? <Loader2Icon className="size-4 animate-spin" /> : null}
            تأكيد التنفيذ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
