"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import {
  updateOdooTaskAction,
  updateOdooTaskStageAction,
} from "@/app/dashboard/ai-agent/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { OdooTaskStageOption, OdooTaskUiRow, OdooUserOption } from "@/lib/integrations/odoo-task-ui-types";
import { cn } from "@/lib/utils";

type Props = {
  task: OdooTaskUiRow;
  stages: OdooTaskStageOption[];
  users: OdooUserOption[];
  odooBaseUrl?: string | null;
  busy: boolean;
  onBusy: (key: string, fn: () => Promise<void>) => void;
  onChanged: () => void;
};

function assigneeSummary(task: OdooTaskUiRow): string {
  if (task.assignees.length) return task.assignees.map((a) => a.name).join("، ");
  return task.responsible !== "—" ? task.responsible : "—";
}

export function OdooTaskExpandedDetail({
  task,
  stages,
  users,
  odooBaseUrl,
  busy,
  onBusy,
  onChanged,
}: Props) {
  const [stagePick, setStagePick] = useState(String(task.stageId ?? ""));
  const [assigneePick, setAssigneePick] = useState<number[]>(task.assigneeIds);

  const stagesForProject = useMemo(() => {
    if (!task.projectId) return stages;
    const scoped = stages.filter(
      (s) => !s.projectIds.length || s.projectIds.includes(task.projectId!)
    );
    return scoped.length ? scoped : stages;
  }, [stages, task.projectId]);

  const odooLink =
    odooBaseUrl && task.id
      ? `${odooBaseUrl.replace(/\/$/, "")}/web#id=${task.id}&model=project.task&view_type=form`
      : null;

  function moveStage() {
    const stageId = Number(stagePick);
    if (!Number.isFinite(stageId) || stageId <= 0) {
      toast.error("اختر مرحلة صالحة.");
      return;
    }
    onBusy(`stage-${task.id}`, async () => {
      const res = await updateOdooTaskStageAction({ taskId: task.id, stageId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message);
      onChanged();
    });
  }

  function saveAssignees() {
    onBusy(`assignees-${task.id}`, async () => {
      const res = await updateOdooTaskAction({
        taskId: task.id,
        assigneeIds: assigneePick,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("تم تحديث المكلفين في Odoo.");
      onChanged();
    });
  }

  function toggleAssignee(id: number) {
    setAssigneePick((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  return (
    <div className="grid gap-3 text-sm">
      <div className="grid gap-2 sm:grid-cols-2">
        <p>
          <span className="font-medium">عنوان المهمة:</span> {task.name}
        </p>
        <p>
          <span className="font-medium">المشروع:</span> {task.project}
        </p>
        <p>
          <span className="font-medium">المرحلة الحالية:</span> {task.stage}
        </p>
        <p>
          <span className="font-medium">الأولوية:</span> {task.priority}
        </p>
        <p>
          <span className="font-medium">المنشئ:</span> {task.creator}
        </p>
        <p>
          <span className="font-medium">المسؤول الرئيسي:</span> {task.responsible}
        </p>
        <p>
          <span className="font-medium">الحالة:</span> {task.active ? "نشطة" : "مؤرشفة"}
        </p>
        <p>
          <span className="font-medium">الاستحقاق:</span> {task.deadline}
        </p>
      </div>

      <div>
        <p className="mb-1.5 font-medium">المكلفون</p>
        {task.assignees.length ? (
          <div className="flex flex-wrap gap-1.5">
            {task.assignees.map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                title={`#${a.id}`}
              >
                {a.name.charAt(0).toUpperCase()}
                <span className="ms-1">{a.name}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">{assigneeSummary(task)}</p>
        )}
      </div>

      {task.tags.length ? (
        <div>
          <p className="mb-1.5 font-medium">الوسوم</p>
          <div className="flex flex-wrap gap-1">
            {task.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-md border border-border bg-muted/50 px-2 py-0.5 text-xs"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <p className="mb-1 font-medium">الوصف / خطوات العمل</p>
        <div className="max-h-48 overflow-y-auto rounded-md border bg-background/80 p-2 text-xs leading-relaxed whitespace-pre-wrap">
          {task.descriptionPlain || "لا يوجد وصف."}
        </div>
      </div>

      <div className="rounded-md border bg-muted/20 p-3">
        <p className="mb-2 text-xs font-semibold text-primary">إجراءات سريعة (Odoo)</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">نقل إلى مرحلة</Label>
            <div className="flex gap-1">
              <select
                className="border-input bg-background h-9 min-w-0 flex-1 rounded-md border px-2 text-xs"
                value={stagePick}
                onChange={(e) => setStagePick(e.target.value)}
                disabled={busy}
              >
                <option value="">— اختر مرحلة —</option>
                {stagesForProject.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.name}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy || !stagePick}
                onClick={() => moveStage()}
              >
                نقل
              </Button>
            </div>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">تعديل المكلفين</Label>
            <div className="max-h-28 overflow-y-auto rounded-md border bg-background p-2">
              <div className="flex flex-wrap gap-1">
                {users.slice(0, 80).map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    disabled={busy}
                    onClick={() => toggleAssignee(u.id)}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                      assigneePick.includes(u.id)
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border bg-background hover:bg-muted/60"
                    )}
                  >
                    {u.name}
                  </button>
                ))}
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => saveAssignees()}
            >
              {busy ? <Loader2Icon className="me-1 size-3.5 animate-spin" /> : null}
              حفظ المكلفين
            </Button>
          </div>
        </div>

        {odooLink ? (
          <a
            href={odooLink}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs text-primary underline"
          >
            فتح المهمة في Odoo
            <ExternalLink className="size-3" />
          </a>
        ) : null}
      </div>
    </div>
  );
}
