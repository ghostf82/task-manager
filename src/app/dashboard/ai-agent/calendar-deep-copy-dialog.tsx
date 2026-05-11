"use client";

import { useEffect, useState } from "react";
import { CheckIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { cloneOdooCalendarEventPhaseOneAction } from "@/app/dashboard/ai-agent/actions";
import { copyOdooMeetingAgendaInSlices } from "@/app/dashboard/ai-agent/odoo-calendar-agenda-copy-batches";
import { withSlicePostRetries } from "@/lib/netlify-slice-retry";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type DeepCopyCalendarSource = {
  id: number;
  name: string;
  start: string;
  stop: string;
  allday: boolean;
  description: string;
  location: string;
  partnerIds: number[];
  responsibleId?: number;
};

function parseOdooDateTime(v: string): Date | null {
  const txt = String(v || "").trim();
  if (!txt) return null;
  const d = new Date(txt.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
}

function toOdooDateTime(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

/** Move event so its calendar *start day* matches `targetYmd` (YYYY-MM-DD), preserving duration and clock times. */
export function shiftEventToAnchorYmd(
  sourceStart: string,
  sourceStop: string,
  targetYmd: string
): { start: string; stop: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetYmd)) return null;
  const st = parseOdooDateTime(sourceStart);
  if (!st) return null;
  const en = parseOdooDateTime(sourceStop) ?? st;
  const [Y, M, D] = targetYmd.split("-").map(Number);
  if (!Y || !M || !D) return null;
  const anchor = new Date(Y, M - 1, D);
  const startDay = new Date(st.getFullYear(), st.getMonth(), st.getDate());
  const deltaMs = anchor.getTime() - startDay.getTime();
  const newSt = new Date(st.getTime() + deltaMs);
  const newEn = new Date(en.getTime() + deltaMs);
  return { start: toOdooDateTime(newSt), stop: toOdooDateTime(newEn) };
}

function startDayYmdFromOdoo(start: string): string {
  const s = String(start || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = parseOdooDateTime(s);
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type CopyProgress =
  | "idle"
  | "creating_event"
  | "copying_agenda"
  | "completed"
  | "failed_phase1"
  | "failed_phase2";

export function CalendarDeepCopyDialog({
  open,
  onOpenChange,
  source,
  onCompleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: DeepCopyCalendarSource | null;
  onCompleted?: () => void;
}) {
  const [targetDay, setTargetDay] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<CopyProgress>("idle");
  const [newEventId, setNewEventId] = useState<number | null>(null);
  const [agendaSummary, setAgendaSummary] = useState<string | null>(null);
  const [progressDetail, setProgressDetail] = useState("");

  useEffect(() => {
    if (!open || !source) return;
    setTargetDay(startDayYmdFromOdoo(source.start));
    setEventTitle(source.name);
    setPending(false);
    setProgress("idle");
    setNewEventId(null);
    setAgendaSummary(null);
  }, [open, source]);

  const preview =
    source && targetDay
      ? shiftEventToAnchorYmd(source.start, source.stop, targetDay)
      : null;

  async function runCopy() {
    if (!source || !preview || !eventTitle.trim()) {
      toast.error("أكمل تاريخ الوجهة وعنوان الحدث.");
      return;
    }
    setPending(true);
    setProgress("creating_event");
    setNewEventId(null);
    setAgendaSummary(null);
    setProgressDetail("");

    let createdEventId: number | undefined;
    try {
      const p1 = await withSlicePostRetries(() =>
        cloneOdooCalendarEventPhaseOneAction({
          sourceEventId: source.id,
          name: eventTitle.trim(),
          start: preview.start,
          stop: preview.stop,
          allday: source.allday,
          description: source.description || undefined,
          location: source.location || undefined,
          partnerIds: source.partnerIds?.length ? source.partnerIds : undefined,
          responsibleId: source.responsibleId,
          skipRevalidate: true,
        })
      );

      if (!p1.ok) {
        setProgress("failed_phase1");
        toast.error(p1.error);
        setPending(false);
        return;
      }

      createdEventId = p1.newEventId;
      setNewEventId(p1.newEventId);
      setProgress("copying_agenda");

      const p2 = await copyOdooMeetingAgendaInSlices({
        sourceEventId: source.id,
        targetEventId: p1.newEventId,
        targetEventStart: preview.start,
        sourceEventStart: source.start,
        targetDescriptionForFallback: source.description || undefined,
        onProgress: (label) => setProgressDetail(label),
      });

      if (!p2.ok) {
        setProgress("failed_phase2");
        toast.error(
          `${p2.error} — تم إنشاء الحدث #${p1.newEventId} لكن الأجندة لم تُنسخ بالكامل؛ يمكنك إكمالها يدويًا في Odoo.`
        );
        setPending(false);
        return;
      }

      setAgendaSummary(
        `جدول أجندة: ${p2.agendaTableItemsCreated}، أنشطة بريد: ${p2.agendaActivitiesCreated}` +
          (p2.fallbackDescriptionUpdated ? "، وتم لصق نص احتياطي في الوصف." : "")
      );
      setProgress("completed");
      toast.success(`تم النسخ العميق — الحدث الجديد #${p1.newEventId}`);
      onCompleted?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (createdEventId) {
        setProgress("failed_phase2");
        toast.error(
          `${msg} — تم إنشاء الحدث #${createdEventId} لكن الاتصال انقطع أثناء نسخ الأجندة؛ أعد المحاولة أو أكمل يدويًا في Odoo.`
        );
      } else {
        setProgress("failed_phase1");
        toast.error(`${msg} — أعد المحاولة؛ إن تكرر الخطأ فالمشكلة غالبًا من مهلة Netlify أو بطء Odoo.`);
      }
    } finally {
      setPending(false);
    }
  }

  if (!source) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>نسخ عميق للحدث</DialogTitle>
          <DialogDescription>
            إنشاء <code className="text-[11px]">calendar.event</code> في طلب واحد، ثم نسخ الأجندة عبر{" "}
            <strong>عدة طلبات صغيرة</strong> (جدول الأجندة دفعات ثم البريد دفعات) لتجنّب انتهاء مهلة Netlify 504.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="rounded-md border border-border/60 bg-muted/20 p-2 text-xs text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">المصدر:</span> #{source.id} — {source.name}
            </p>
            <p className="mt-0.5 [direction:ltr]">{source.start} → {source.stop}</p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="deep-copy-target-day">تاريخ بداية الحدث في الوجهة</Label>
            <Input
              id="deep-copy-target-day"
              type="date"
              value={targetDay}
              onChange={(e) => setTargetDay(e.target.value)}
              disabled={pending}
              className="[direction:ltr]"
            />
            <p className="text-[11px] text-muted-foreground">
              يُثبت يوم البداية على التقويم المختار مع الحفاظ على نفس الوقت والمدة الزمنية للحدث الأصلي.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="deep-copy-title">عنوان الحدث في Odoo</Label>
            <Input
              id="deep-copy-title"
              value={eventTitle}
              onChange={(e) => setEventTitle(e.target.value)}
              disabled={pending}
              placeholder={source.name}
            />
            <p className="text-[11px] text-muted-foreground">يمكنك الاحتفاظ بالاسم أو تعديله قبل التنفيذ.</p>
          </div>

          {preview ? (
            <div className="rounded-md border border-emerald-500/25 bg-emerald-500/5 p-2 text-xs">
              <p className="font-medium text-emerald-900 dark:text-emerald-100">معاينة بعد التحريك</p>
              <p className="mt-1 font-mono text-[11px] [direction:ltr] text-muted-foreground">
                {preview.start} → {preview.stop}
              </p>
            </div>
          ) : (
            <p className="text-xs text-destructive">صيغة تاريخ الوجهة غير صالحة.</p>
          )}

          <div className="space-y-2 rounded-md border border-border/50 bg-background/80 p-3">
            <p className="text-xs font-medium text-foreground">التقدم</p>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li className="flex items-center gap-2">
                {progress === "creating_event" ? (
                  <Loader2Icon className="size-3.5 shrink-0 animate-spin text-primary" />
                ) : newEventId ? (
                  <CheckIcon className="size-3.5 shrink-0 text-emerald-600" />
                ) : (
                  <span className="size-3.5 shrink-0 rounded-full border border-border" />
                )}
                <span>1) إنشاء الحدث في Odoo</span>
                {newEventId ? <span className="[direction:ltr] text-foreground">#{newEventId}</span> : null}
              </li>
              <li className="flex items-center gap-2">
                {progress === "copying_agenda" ? (
                  <Loader2Icon className="size-3.5 shrink-0 animate-spin text-primary" />
                ) : progress === "completed" ? (
                  <CheckIcon className="size-3.5 shrink-0 text-emerald-600" />
                ) : progress === "failed_phase2" ? (
                  <span className="text-destructive">!</span>
                ) : (
                  <span className="size-3.5 shrink-0 rounded-full border border-border" />
                )}
                <span>2) نسخ الأجندة (جدول + بريد)</span>
              </li>
            </ul>
            {progressDetail ? (
              <p className="text-[11px] text-muted-foreground [direction:ltr]">{progressDetail}</p>
            ) : null}
            {agendaSummary ? <p className="text-[11px] text-muted-foreground">{agendaSummary}</p> : null}
            {progress === "failed_phase1" ? (
              <p className="text-[11px] text-destructive">تعذّر إنشاء الحدث — لم تُنفَّذ مرحلة الأجندة.</p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-3">
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button
            type="button"
            disabled={pending || !preview || !eventTitle.trim()}
            onClick={() => void runCopy()}
            className="gap-2"
          >
            {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {pending ? "جاري التنفيذ…" : "تنفيذ النسخ العميق"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
