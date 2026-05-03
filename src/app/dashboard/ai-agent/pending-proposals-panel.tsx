"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2Icon, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  confirmProposalExecutionAction,
  rejectProposalAsync,
} from "@/app/dashboard/ai-agent/actions";
import { useDashboardI18n } from "@/contexts/dashboard-i18n";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

export type PendingProposalRow = {
  id: string;
  kind: string;
  title: string;
  summary: string;
  detail_json: unknown;
  proposed_action: unknown;
  created_at: string;
};

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
  taskId: number | null;
  targetStageId: number | null;
} | null {
  if (!isRecord(detail) || !isRecord(detail.odooPreview)) return null;
  const o = detail.odooPreview as Record<string, unknown>;
  return {
    taskName: typeof o.taskName === "string" ? o.taskName : "—",
    currentStageName: typeof o.currentStageName === "string" ? o.currentStageName : "—",
    targetStageName: typeof o.targetStageName === "string" ? o.targetStageName : "—",
    taskId: typeof o.taskId === "number" ? o.taskId : null,
    targetStageId: typeof o.targetStageId === "number" ? o.targetStageId : null,
  };
}

export function PendingProposalsPanel({ proposals }: { proposals: PendingProposalRow[] }) {
  const { t, dateLocale } = useDashboardI18n();
  const router = useRouter();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<PendingProposalRow | null>(null);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [confirming, startConfirm] = useTransition();

  const sorted = useMemo(
    () => [...proposals].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    [proposals]
  );

  function openReview(p: PendingProposalRow) {
    setSelected(p);
    setDialogOpen(true);
    const pa = p.proposed_action;
    const kind = actionType(pa);
    if (kind === "send_email_reply" && isRecord(pa)) {
      setEmailSubject(typeof pa.subject === "string" ? pa.subject : "");
      setEmailBody(typeof pa.body === "string" ? pa.body : "");
    } else {
      setEmailSubject("");
      setEmailBody("");
    }
  }

  function closeDialog() {
    setDialogOpen(false);
    setSelected(null);
  }

  function confirmExecution() {
    if (!selected) return;
    const id = selected.id;
    const kind = actionType(selected.proposed_action);
    if (kind === "send_email_reply" && !emailBody.trim()) {
      toast.error(t("proposalReview.bodyRequiredToast"));
      return;
    }
    startConfirm(async () => {
      const res = await confirmProposalExecutionAction({
        proposalId: id,
        emailBody: kind === "send_email_reply" ? emailBody : undefined,
        emailSubject: kind === "send_email_reply" ? emailSubject : undefined,
      });
      if (res.ok) {
        toast.success(res.message);
        closeDialog();
      } else {
        toast.error(res.error);
      }
      router.refresh();
    });
  }

  async function reject(id: string) {
    setRejectingId(id);
    const res = await rejectProposalAsync(id);
    setRejectingId(null);
    if (res.ok) {
      toast.success(t("aiAgentPending.toastRejected"));
    } else {
      toast.error(res.error);
    }
    router.refresh();
  }

  const dialogAction = selected ? actionType(selected.proposed_action) : "";
  const odooPreview = selected ? readOdooPreview(selected.detail_json) : null;

  return (
    <>
      <Card className="border-border/80 shadow-md ring-1 ring-violet-500/10">
        <CardHeader>
          <CardTitle>{t("aiAgentPending.panelTitle")}</CardTitle>
          <CardDescription>{t("aiAgentPending.panelSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!sorted.length ? (
            <EmptyState
              icon={Sparkles}
              title={t("aiAgentPending.emptyTitle")}
              description={t("aiAgentPending.emptyDescription")}
              action={{
                label: t("aiAgentPending.goToAgent"),
                href: "/dashboard/ai-agent",
              }}
            />
          ) : (
            sorted.map((p) => (
              <div
                key={p.id}
                className="rounded-xl border border-border bg-muted/15 p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {p.kind}
                    </p>
                    <h3 className="mt-0.5 font-semibold leading-snug">{p.title}</h3>
                  </div>
                  <span className="text-muted-foreground shrink-0 text-[11px]">
                    {new Date(p.created_at).toLocaleString(dateLocale, {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                </div>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{p.summary}</p>
                <pre className="mt-3 max-h-32 overflow-auto rounded-lg border border-border/80 bg-background/80 p-3 text-[11px] leading-relaxed [direction:ltr]">
                  {JSON.stringify(p.proposed_action, null, 2)}
                </pre>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={() => openReview(p)}>
                    {t("aiAgentPending.reviewing")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={rejectingId === p.id}
                    onClick={() => reject(p.id)}
                  >
                    {rejectingId === p.id ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : null}
                    {t("aiAgentPending.reject")}
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setSelected(null);
          }
        }}
      >
        <DialogContent
          showCloseButton
          className="max-h-[min(90vh,640px)] overflow-y-auto sm:max-w-lg"
        >
          <DialogHeader>
            <DialogTitle className="text-start leading-snug">
              {t("proposalReview.dialogTitle")}
            </DialogTitle>
            <DialogDescription className="text-start">
              {selected?.title}
            </DialogDescription>
          </DialogHeader>

          {selected && dialogAction === "send_email_reply" ? (
            <div className="grid gap-4 border border-border/60 rounded-lg bg-muted/20 p-4">
              <p className="text-muted-foreground text-xs leading-relaxed">
                {t("proposalReview.dialogSubtitle")}
              </p>
              <div className="grid gap-2">
                <Label htmlFor="rev-to">{t("proposalReview.labelTo")}</Label>
                <Input
                  id="rev-to"
                  readOnly
                  dir="ltr"
                  className="font-mono text-xs"
                  value={
                    isRecord(selected.proposed_action) &&
                    typeof selected.proposed_action.to === "string"
                      ? selected.proposed_action.to
                      : ""
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rev-subject">{t("proposalReview.labelSubject")}</Label>
                <Input
                  id="rev-subject"
                  dir="ltr"
                  className="font-mono text-sm"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rev-body">{t("proposalReview.labelBody")}</Label>
                <Textarea
                  id="rev-body"
                  rows={10}
                  className="min-h-[180px] resize-y text-sm leading-relaxed"
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                />
              </div>
            </div>
          ) : null}

          {selected && dialogAction === "odoo_update_task" ? (
            <div className="grid gap-3 rounded-lg border border-border/60 bg-muted/20 p-4 text-sm">
              <div className="flex justify-between gap-4 border-b border-border/50 pb-2">
                <span className="text-muted-foreground">{t("proposalReview.labelTask")}</span>
                <span className="max-w-[60%] text-start font-medium">
                  {odooPreview?.taskName ?? "—"}
                </span>
              </div>
              <div className="flex justify-between gap-4 border-b border-border/50 pb-2">
                <span className="text-muted-foreground">{t("proposalReview.labelCurrentStage")}</span>
                <span className="max-w-[60%] text-start">{odooPreview?.currentStageName ?? "—"}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">{t("proposalReview.labelNextStage")}</span>
                <span className="max-w-[60%] text-start font-medium text-emerald-700 dark:text-emerald-300">
                  {odooPreview?.targetStageName ?? "—"}
                </span>
              </div>
              {isRecord(selected.proposed_action) ? (
                <p className="text-muted-foreground text-[11px] [direction:ltr]">
                  taskId: {String(selected.proposed_action.taskId)} → stageId:{" "}
                  {String(selected.proposed_action.stageId)}
                </p>
              ) : null}
            </div>
          ) : null}

          {selected &&
          dialogAction &&
          dialogAction !== "send_email_reply" &&
          dialogAction !== "odoo_update_task" ? (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm leading-relaxed">
              <p className="font-medium text-amber-900 dark:text-amber-200">{t("proposalReview.summaryTitle")}</p>
              <p className="text-muted-foreground mt-1 text-xs">{selected.summary}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {t("proposalReview.actionType")}{" "}
                <span className="font-mono [direction:ltr]">{dialogAction}</span>
              </p>
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={closeDialog}>
              {t("proposalReview.cancel")}
            </Button>
            <Button type="button" disabled={confirming} onClick={confirmExecution} className="gap-2">
              {confirming ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {t("proposalReview.confirmExecute")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
