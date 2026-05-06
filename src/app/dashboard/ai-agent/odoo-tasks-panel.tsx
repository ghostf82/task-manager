"use client";

import { useState, useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import {
  createOdooTaskAction,
  listOdooTasksAction,
  updateOdooTaskStageAction,
} from "@/app/dashboard/ai-agent/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type TaskRow = {
  id: number;
  name: string;
  stage: string;
  project: string;
  deadline: string;
};

export function OdooTasksPanel() {
  const [pending, start] = useTransition();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [query, setQuery] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [taskIdForUpdate, setTaskIdForUpdate] = useState("");
  const [stageIdForUpdate, setStageIdForUpdate] = useState("");

  function loadTasks() {
    start(async () => {
      const res = await listOdooTasksAction({ text: query, limit: 50 });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setTasks(res.tasks);
      toast.success(`تم جلب ${res.tasks.length} مهمة من Odoo.`);
    });
  }

  function createTask() {
    if (!newTitle.trim()) {
      toast.error("عنوان المهمة مطلوب.");
      return;
    }
    start(async () => {
      const res = await createOdooTaskAction({
        title: newTitle.trim(),
        description: newDescription.trim() || undefined,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${res.message} (رقم ${res.taskId})`);
      setNewTitle("");
      setNewDescription("");
      const refreshed = await listOdooTasksAction({ text: query, limit: 50 });
      if (refreshed.ok) setTasks(refreshed.tasks);
    });
  }

  function updateStage() {
    const taskId = Number(taskIdForUpdate);
    const stageId = Number(stageIdForUpdate);
    if (!Number.isFinite(taskId) || !Number.isFinite(stageId)) {
      toast.error("أدخل رقم مهمة ورقم مرحلة صالحين.");
      return;
    }
    start(async () => {
      const res = await updateOdooTaskStageAction({ taskId, stageId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message);
      const refreshed = await listOdooTasksAction({ text: query, limit: 50 });
      if (refreshed.ok) setTasks(refreshed.tasks);
    });
  }

  return (
    <Card className="border-border/80 shadow-sm ring-1 ring-violet-500/10">
      <CardHeader>
        <CardTitle>لوحة مهام Odoo (Browser Session)</CardTitle>
        <CardDescription>
          قراءة/بحث/تحديث/إنشاء مهام Odoo بدون Database Name.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="بحث بالعنوان..."
            className="max-w-sm"
          />
          <Button type="button" onClick={loadTasks} disabled={pending}>
            {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
            جلب المهام
          </Button>
        </div>

        <div className="grid gap-2 rounded-md border p-3">
          <Label>إنشاء مهمة جديدة</Label>
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="عنوان المهمة"
          />
          <Input
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="وصف (اختياري)"
          />
          <Button type="button" variant="outline" onClick={createTask} disabled={pending}>
            إنشاء في Odoo
          </Button>
        </div>

        <div className="grid gap-2 rounded-md border p-3">
          <Label>تحديث مرحلة مهمة</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              value={taskIdForUpdate}
              onChange={(e) => setTaskIdForUpdate(e.target.value)}
              placeholder="Task ID"
              className="w-32"
            />
            <Input
              value={stageIdForUpdate}
              onChange={(e) => setStageIdForUpdate(e.target.value)}
              placeholder="Stage ID"
              className="w-32"
            />
            <Button type="button" variant="outline" onClick={updateStage} disabled={pending}>
              تحديث المرحلة
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 text-start">ID</th>
                <th className="py-2 text-start">المهمة</th>
                <th className="py-2 text-start">المرحلة</th>
                <th className="py-2 text-start">المشروع</th>
                <th className="py-2 text-start">الاستحقاق</th>
              </tr>
            </thead>
            <tbody>
              {!tasks.length ? (
                <tr>
                  <td colSpan={5} className="py-3 text-center text-muted-foreground">
                    لا توجد نتائج حتى الآن.
                  </td>
                </tr>
              ) : (
                tasks.map((t) => (
                  <tr key={t.id} className="border-b">
                    <td className="py-2">{t.id}</td>
                    <td className="py-2">{t.name}</td>
                    <td className="py-2">{t.stage}</td>
                    <td className="py-2">{t.project}</td>
                    <td className="py-2">{t.deadline}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

