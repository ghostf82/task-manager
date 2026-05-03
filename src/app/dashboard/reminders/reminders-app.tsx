"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bell, Plus, Trash2, Volume2, VolumeX, Mail, MailX } from "lucide-react";
import {
  createPersonalReminderAction,
  deletePersonalReminderAction,
  toggleReminderActiveAction,
  updatePersonalReminderAction,
  tickPersonalRemindersAction,
  type ReminderInput,
} from "@/app/dashboard/reminders/actions";
import { Badge } from "@/components/ui/badge";
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
import { Separator } from "@/components/ui/separator";

export type ReminderRow = {
  id: string;
  title: string;
  remind_at: string;
  recurrence: "once" | "daily" | "weekly";
  sound_enabled: boolean;
  email_enabled: boolean;
  is_active: boolean;
};

const recurrenceLabels: Record<ReminderRow["recurrence"], string> = {
  once: "مرة واحدة",
  daily: "يومي",
  weekly: "أسبوعي",
};

function playSoftBeep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.08;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.18);
    ctx.resume();
  } catch {
    /* ignore */
  }
}

export function RemindersApp({ initial }: { initial: ReminderRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState(initial);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ReminderRow | null>(null);

  useEffect(() => {
    setRows(initial);
  }, [initial]);

  useEffect(() => {
    const id = window.setInterval(() => {
      startTransition(async () => {
        try {
          const res = await tickPersonalRemindersAction();
          if (res.fired > 0) {
            if (res.playSound) playSoftBeep();
            toast.info(`تم تفعيل ${res.fired} تذكيراً`, {
              icon: <Bell className="size-4" />,
            });
            router.refresh();
          }
        } catch {
          /* offline / session */
        }
      });
    }, 45_000);
    return () => window.clearInterval(id);
  }, [router, startTransition]);

  const nextLabel = useMemo(() => {
    return rows
      .filter((r) => r.is_active)
      .sort(
        (a, b) =>
          new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime()
      )[0];
  }, [rows]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            التذكيرات الشخصية
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            تذكيرات مستقلة عن مهام الشركة. يتم التحقق كل 45 ثانية أثناء فتح
            التطبيق، مع تنبيه صوتي وإشعار داخل المنصة والبريد عند التفعيل.
          </p>
        </div>
        <Button type="button" size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          تذكير جديد
        </Button>
      </div>

      {nextLabel ? (
        <Card className="border-primary/25 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="size-4" />
              أقرب موعد
            </CardTitle>
            <CardDescription>
              {nextLabel.title} —{" "}
              {new Date(nextLabel.remind_at).toLocaleString("ar-SA", {
                dateStyle: "medium",
                timeStyle: "short",
              })}{" "}
              ({recurrenceLabels[nextLabel.recurrence]})
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <div className="grid gap-3">
        {rows.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground py-10 text-center text-sm">
              لا توجد تذكيرات بعد. أنشئ أول تذكير للبقاء منظماً خارج مهام
              الشركة.
            </CardContent>
          </Card>
        ) : (
          rows.map((r) => (
            <Card
              key={r.id}
              className={r.is_active ? "" : "opacity-60 border-dashed"}
            >
              <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                <div className="min-w-0 space-y-1">
                  <CardTitle className="truncate text-base">{r.title}</CardTitle>
                  <CardDescription>
                    {new Date(r.remind_at).toLocaleString("ar-SA", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}{" "}
                    · {recurrenceLabels[r.recurrence]}
                  </CardDescription>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1">
                  {r.sound_enabled ? (
                    <Badge variant="secondary" className="gap-0.5 text-[10px]">
                      <Volume2 className="size-3" /> صوت
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-0.5 text-[10px]">
                      <VolumeX className="size-3" /> بدون صوت
                    </Badge>
                  )}
                  {r.email_enabled ? (
                    <Badge variant="secondary" className="gap-0.5 text-[10px]">
                      <Mail className="size-3" /> بريد
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-0.5 text-[10px]">
                      <MailX className="size-3" />
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => setEditing(r)}
                >
                  تعديل
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      try {
                        await toggleReminderActiveAction(r.id, !r.is_active);
                        router.refresh();
                      } catch (e) {
                        toast.error(
                          e instanceof Error ? e.message : "تعذر التحديث"
                        );
                      }
                    })
                  }
                >
                  {r.is_active ? "إيقاف مؤقت" : "تفعيل"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  disabled={pending}
                  onClick={() => {
                    if (!confirm("حذف هذا التذكير؟")) return;
                    startTransition(async () => {
                      try {
                        await deletePersonalReminderAction(r.id);
                        router.refresh();
                      } catch (e) {
                        toast.error(
                          e instanceof Error ? e.message : "تعذر الحذف"
                        );
                      }
                    });
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Separator />

      <ReminderFormDialog
        open={open}
        onOpenChange={setOpen}
        mode="create"
        onSubmit={async (input) => {
          await createPersonalReminderAction(input);
          toast.success("تم إنشاء التذكير");
          setOpen(false);
          router.refresh();
        }}
      />
      <ReminderFormDialog
        open={Boolean(editing)}
        onOpenChange={(o) => !o && setEditing(null)}
        mode="edit"
        initial={editing ?? undefined}
        onSubmit={async (input) => {
          if (!editing) return;
          await updatePersonalReminderAction(editing.id, input);
          toast.success("تم التحديث");
          setEditing(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function ReminderFormDialog({
  open,
  onOpenChange,
  mode,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode: "create" | "edit";
  initial?: ReminderRow;
  onSubmit: (v: ReminderInput) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [dt, setDt] = useState("");
  const [rec, setRec] = useState<ReminderRow["recurrence"]>("once");
  const [sound, setSound] = useState(true);
  const [email, setEmail] = useState(true);

  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title ?? "");
    setRec(initial?.recurrence ?? "once");
    setSound(initial?.sound_enabled ?? true);
    setEmail(initial?.email_enabled ?? true);
    if (initial?.remind_at) {
      const d = new Date(initial.remind_at);
      const pad = (n: number) => String(n).padStart(2, "0");
      const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      setDt(local);
    } else {
      const d = new Date();
      d.setMinutes(d.getMinutes() + 30);
      const pad = (n: number) => String(n).padStart(2, "0");
      setDt(
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
      );
    }
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "تذكير جديد" : "تعديل التذكير"}
          </DialogTitle>
          <DialogDescription>
            اختر التاريخ والوقت بتوقيت جهازك؛ يُخزَّن كـ UTC في الخادم.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="r-title">اسم التذكير</Label>
            <Input
              id="r-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: مراجعة التقرير الأسبوعي"
              disabled={pending}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="r-dt">التاريخ والوقت</Label>
            <Input
              id="r-dt"
              type="datetime-local"
              value={dt}
              onChange={(e) => setDt(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="grid gap-2">
            <Label>التكرار</Label>
            <select
              className="border-input bg-background h-9 rounded-md border px-2 text-sm"
              value={rec}
              disabled={pending}
              onChange={(e) => setRec(e.target.value as ReminderRow["recurrence"])}
            >
              <option value="once">مرة واحدة</option>
              <option value="daily">يومي</option>
              <option value="weekly">أسبوعي</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={sound}
                onChange={(e) => setSound(e.target.checked)}
                disabled={pending}
              />
              تنبيه صوتي
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={email}
                onChange={(e) => setEmail(e.target.checked)}
                disabled={pending}
              />
              بريد إلكتروني
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            disabled={pending || !title.trim() || !dt}
            onClick={() => {
              const iso = new Date(dt).toISOString();
              startTransition(async () => {
                try {
                  await onSubmit({
                    title: title.trim(),
                    remind_at: iso,
                    recurrence: rec,
                    sound_enabled: sound,
                    email_enabled: email,
                  });
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "فشل الحفظ");
                }
              });
            }}
          >
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
