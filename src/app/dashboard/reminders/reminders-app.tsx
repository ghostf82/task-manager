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
import { useDashboardI18n } from "@/contexts/dashboard-i18n";
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

function recurrenceKey(rec: ReminderRow["recurrence"]) {
  if (rec === "once") return "remindersPage.repeatOnce";
  if (rec === "daily") return "remindersPage.repeatDaily";
  return "remindersPage.repeatWeekly";
}

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
  const { t, dateLocale } = useDashboardI18n();
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
            toast.info(t("remindersPage.toastFired").replace("{count}", String(res.fired)), {
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
  }, [router, startTransition, t]);

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
          <h1 className="text-2xl font-semibold tracking-tight">{t("remindersPage.title")}</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">{t("remindersPage.subtitle")}</p>
        </div>
        <Button type="button" size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          {t("remindersPage.newReminder")}
        </Button>
      </div>

      {nextLabel ? (
        <Card className="border-primary/25 bg-linear-to-br from-primary/8 via-white/65 to-cyan-500/8">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="size-4" />
              {t("remindersPage.nearest")}
            </CardTitle>
            <CardDescription>
              {nextLabel.title} —{" "}
              <span suppressHydrationWarning>
                {new Date(nextLabel.remind_at).toLocaleString(dateLocale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>{" "}
              ({t(recurrenceKey(nextLabel.recurrence))})
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <div className="grid gap-3">
        {rows.length === 0 ? (
          <Card className="premium-surface">
            <CardContent className="text-muted-foreground py-10 text-center text-sm">
              {t("remindersPage.emptyTitle")}. {t("remindersPage.emptyDescription")}
            </CardContent>
          </Card>
        ) : (
          rows.map((r) => (
            <Card
              key={r.id}
              className={r.is_active ? "premium-surface" : "premium-surface opacity-60 border-dashed"}
            >
              <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                <div className="min-w-0 space-y-1">
                  <CardTitle className="truncate text-base">{r.title}</CardTitle>
                  <CardDescription>
                    <span suppressHydrationWarning>
                      {new Date(r.remind_at).toLocaleString(dateLocale, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>{" "}
                    · {t(recurrenceKey(r.recurrence))}
                  </CardDescription>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1">
                  {r.sound_enabled ? (
                    <Badge variant="secondary" className="gap-0.5 text-[10px]">
                      <Volume2 className="size-3" /> {t("remindersPage.soundOn")}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-0.5 text-[10px]">
                      <VolumeX className="size-3" /> {t("remindersPage.soundOff")}
                    </Badge>
                  )}
                  {r.email_enabled ? (
                    <Badge variant="secondary" className="gap-0.5 text-[10px]">
                      <Mail className="size-3" /> {t("remindersPage.emailOn")}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-0.5 text-[10px]">
                      <MailX className="size-3" /> {t("remindersPage.emailOff")}
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
                  {t("remindersPage.edit")}
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
                          e instanceof Error ? e.message : t("remindersPage.updateFail")
                        );
                      }
                    })
                  }
                >
                  {r.is_active ? t("remindersPage.pause") : t("remindersPage.resume")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  disabled={pending}
                  onClick={() => {
                    if (!confirm(t("remindersPage.confirmDelete"))) return;
                    startTransition(async () => {
                      try {
                        await deletePersonalReminderAction(r.id);
                        router.refresh();
                      } catch (e) {
                        toast.error(
                          e instanceof Error ? e.message : t("remindersPage.deleteFail")
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
          toast.success(t("remindersPage.toastCreated"));
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
          toast.success(t("remindersPage.toastUpdated"));
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
  const { t } = useDashboardI18n();
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
            {mode === "create" ? t("remindersPage.dialogCreateTitle") : t("remindersPage.dialogEditTitle")}
          </DialogTitle>
          <DialogDescription>{t("remindersPage.dialogSubtitle")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="r-title">{t("remindersPage.labelTitle")}</Label>
            <Input
              id="r-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("remindersPage.titlePlaceholder")}
              disabled={pending}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="r-dt">{t("remindersPage.labelDateTime")}</Label>
            <Input
              id="r-dt"
              type="datetime-local"
              value={dt}
              onChange={(e) => setDt(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="grid gap-2">
            <Label>{t("remindersPage.labelRepeat")}</Label>
            <select
              className="border-input bg-background h-9 rounded-md border px-2 text-sm"
              value={rec}
              disabled={pending}
              onChange={(e) => setRec(e.target.value as ReminderRow["recurrence"])}
            >
              <option value="once">{t("remindersPage.repeatOnce")}</option>
              <option value="daily">{t("remindersPage.repeatDaily")}</option>
              <option value="weekly">{t("remindersPage.repeatWeekly")}</option>
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
              {t("remindersPage.soundToggle")}
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={email}
                onChange={(e) => setEmail(e.target.checked)}
                disabled={pending}
              />
              {t("remindersPage.emailToggle")}
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
                  toast.error(e instanceof Error ? e.message : t("remindersPage.saveFail"));
                }
              });
            }}
          >
            {t("remindersPage.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
