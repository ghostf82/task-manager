"use client";

import { useState, useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import {
  createOdooCalendarEventAction,
  createOdooDocumentAction,
  createOdooProjectAction,
  createOdooTaskAction,
  exportOdooWorkspaceExcelAction,
  importOdooWorkspaceExcelAction,
  listOdooCalendarEventsAction,
  listOdooDocumentsAction,
  listOdooProjectsAction,
  listOdooTasksAction,
  updateOdooCalendarEventAction,
  updateOdooDocumentAction,
  updateOdooProjectAction,
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

type ProjectRow = { id: number; name: string; active: boolean };
type CalendarRow = { id: number; name: string; start: string; stop: string; allday: boolean };
type DocumentRow = { id: number; name: string; type: string; createdAt: string };

export function OdooTasksPanel() {
  const [pending, start] = useTransition();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [query, setQuery] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [taskIdForUpdate, setTaskIdForUpdate] = useState("");
  const [stageIdForUpdate, setStageIdForUpdate] = useState("");
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [events, setEvents] = useState<CalendarRow[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [projectName, setProjectName] = useState("");
  const [projectIdForUpdate, setProjectIdForUpdate] = useState("");
  const [projectNameForUpdate, setProjectNameForUpdate] = useState("");
  const [eventName, setEventName] = useState("");
  const [eventStart, setEventStart] = useState("");
  const [eventStop, setEventStop] = useState("");
  const [eventIdForUpdate, setEventIdForUpdate] = useState("");
  const [eventNameForUpdate, setEventNameForUpdate] = useState("");
  const [docName, setDocName] = useState("");
  const [docIdForUpdate, setDocIdForUpdate] = useState("");
  const [docNameForUpdate, setDocNameForUpdate] = useState("");

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

  function loadProjects() {
    start(async () => {
      const res = await listOdooProjectsAction({ text: query, limit: 100 });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setProjects(res.projects);
      toast.success(`تم جلب ${res.projects.length} مشروع.`);
    });
  }

  function createProject() {
    if (!projectName.trim()) return toast.error("اسم المشروع مطلوب.");
    start(async () => {
      const res = await createOdooProjectAction({ name: projectName.trim() });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${res.message} (#${res.projectId})`);
      setProjectName("");
      const refreshed = await listOdooProjectsAction({ text: query, limit: 100 });
      if (refreshed.ok) setProjects(refreshed.projects);
    });
  }

  function updateProject() {
    const projectId = Number(projectIdForUpdate);
    if (!Number.isFinite(projectId) || !projectNameForUpdate.trim()) {
      return toast.error("أدخل رقم مشروع واسم جديد صالحين.");
    }
    start(async () => {
      const res = await updateOdooProjectAction({
        projectId,
        name: projectNameForUpdate.trim(),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message);
      const refreshed = await listOdooProjectsAction({ text: query, limit: 100 });
      if (refreshed.ok) setProjects(refreshed.projects);
    });
  }

  function loadCalendar() {
    start(async () => {
      const res = await listOdooCalendarEventsAction({ text: query, limit: 100 });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setEvents(res.events);
      toast.success(`تم جلب ${res.events.length} حدث تقويم.`);
    });
  }

  function createCalendarEvent() {
    if (!eventName.trim() || !eventStart.trim() || !eventStop.trim()) {
      return toast.error("اسم الحدث وتاريخ البداية والنهاية مطلوبة.");
    }
    start(async () => {
      const res = await createOdooCalendarEventAction({
        name: eventName.trim(),
        start: eventStart.trim(),
        stop: eventStop.trim(),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${res.message} (#${res.eventId})`);
      setEventName("");
      setEventStart("");
      setEventStop("");
      const refreshed = await listOdooCalendarEventsAction({ text: query, limit: 100 });
      if (refreshed.ok) setEvents(refreshed.events);
    });
  }

  function updateCalendarEvent() {
    const eventId = Number(eventIdForUpdate);
    if (!Number.isFinite(eventId) || !eventNameForUpdate.trim()) {
      return toast.error("أدخل رقم الحدث واسمًا جديدًا.");
    }
    start(async () => {
      const res = await updateOdooCalendarEventAction({
        eventId,
        name: eventNameForUpdate.trim(),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message);
      const refreshed = await listOdooCalendarEventsAction({ text: query, limit: 100 });
      if (refreshed.ok) setEvents(refreshed.events);
    });
  }

  function loadDocuments() {
    start(async () => {
      const res = await listOdooDocumentsAction({ text: query, limit: 100 });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setDocuments(res.documents);
      toast.success(`تم جلب ${res.documents.length} مستند.`);
    });
  }

  function createDocument() {
    if (!docName.trim()) return toast.error("اسم المستند مطلوب.");
    start(async () => {
      const res = await createOdooDocumentAction({ name: docName.trim() });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${res.message} (#${res.documentId})`);
      setDocName("");
      const refreshed = await listOdooDocumentsAction({ text: query, limit: 100 });
      if (refreshed.ok) setDocuments(refreshed.documents);
    });
  }

  function updateDocument() {
    const documentId = Number(docIdForUpdate);
    if (!Number.isFinite(documentId) || !docNameForUpdate.trim()) {
      return toast.error("أدخل رقم المستند والاسم الجديد.");
    }
    start(async () => {
      const res = await updateOdooDocumentAction({
        documentId,
        name: docNameForUpdate.trim(),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message);
      const refreshed = await listOdooDocumentsAction({ text: query, limit: 100 });
      if (refreshed.ok) setDocuments(refreshed.documents);
    });
  }

  function exportExcel() {
    start(async () => {
      const res = await exportOdooWorkspaceExcelAction();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const bytes = atob(res.base64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const blob = new Blob([arr], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("تم تصدير ملف Excel بنجاح.");
    });
  }

  function importExcel(file: File | null) {
    if (!file) return;
    start(async () => {
      try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let bin = "";
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        const base64 = btoa(bin);
        const res = await importOdooWorkspaceExcelAction({ base64 });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success(res.message);
        const [t, p, c, d] = await Promise.all([
          listOdooTasksAction({ text: query, limit: 50 }),
          listOdooProjectsAction({ text: query, limit: 100 }),
          listOdooCalendarEventsAction({ text: query, limit: 100 }),
          listOdooDocumentsAction({ text: query, limit: 100 }),
        ]);
        if (t.ok) setTasks(t.tasks);
        if (p.ok) setProjects(p.projects);
        if (c.ok) setEvents(c.events);
        if (d.ok) setDocuments(d.documents);
      } catch {
        toast.error("تعذر قراءة ملف Excel.");
      }
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
          <Button type="button" variant="outline" onClick={loadProjects} disabled={pending}>
            المشاريع
          </Button>
          <Button type="button" variant="outline" onClick={loadCalendar} disabled={pending}>
            التقويم
          </Button>
          <Button type="button" variant="outline" onClick={loadDocuments} disabled={pending}>
            المستندات
          </Button>
          <Button type="button" variant="secondary" onClick={exportExcel} disabled={pending}>
            تصدير Excel
          </Button>
          <label className="inline-flex items-center">
            <input
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => importExcel(e.target.files?.[0] ?? null)}
            />
            <span className="inline-flex h-9 cursor-pointer items-center rounded-md border px-3 text-sm">
              استيراد Excel
            </span>
          </label>
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
          <Label>إدارة المشاريع</Label>
          <div className="flex flex-wrap gap-2">
            <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="اسم مشروع جديد" className="max-w-sm" />
            <Button type="button" variant="outline" onClick={createProject} disabled={pending}>إنشاء مشروع</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input value={projectIdForUpdate} onChange={(e) => setProjectIdForUpdate(e.target.value)} placeholder="Project ID" className="w-32" />
            <Input value={projectNameForUpdate} onChange={(e) => setProjectNameForUpdate(e.target.value)} placeholder="الاسم الجديد" className="max-w-sm" />
            <Button type="button" variant="outline" onClick={updateProject} disabled={pending}>تحديث مشروع</Button>
          </div>
        </div>

        <div className="grid gap-2 rounded-md border p-3">
          <Label>إدارة التقويم</Label>
          <div className="flex flex-wrap gap-2">
            <Input value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="اسم الحدث" className="max-w-sm" />
            <Input value={eventStart} onChange={(e) => setEventStart(e.target.value)} placeholder="Start (YYYY-MM-DD HH:mm:ss)" className="max-w-sm" />
            <Input value={eventStop} onChange={(e) => setEventStop(e.target.value)} placeholder="Stop (YYYY-MM-DD HH:mm:ss)" className="max-w-sm" />
            <Button type="button" variant="outline" onClick={createCalendarEvent} disabled={pending}>إنشاء حدث</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input value={eventIdForUpdate} onChange={(e) => setEventIdForUpdate(e.target.value)} placeholder="Event ID" className="w-32" />
            <Input value={eventNameForUpdate} onChange={(e) => setEventNameForUpdate(e.target.value)} placeholder="اسم جديد للحدث" className="max-w-sm" />
            <Button type="button" variant="outline" onClick={updateCalendarEvent} disabled={pending}>تحديث حدث</Button>
          </div>
        </div>

        <div className="grid gap-2 rounded-md border p-3">
          <Label>إدارة المستندات</Label>
          <div className="flex flex-wrap gap-2">
            <Input value={docName} onChange={(e) => setDocName(e.target.value)} placeholder="اسم مستند جديد" className="max-w-sm" />
            <Button type="button" variant="outline" onClick={createDocument} disabled={pending}>إنشاء مستند</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input value={docIdForUpdate} onChange={(e) => setDocIdForUpdate(e.target.value)} placeholder="Document ID" className="w-32" />
            <Input value={docNameForUpdate} onChange={(e) => setDocNameForUpdate(e.target.value)} placeholder="الاسم الجديد" className="max-w-sm" />
            <Button type="button" variant="outline" onClick={updateDocument} disabled={pending}>تحديث مستند</Button>
          </div>
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

        <div className="grid gap-2 lg:grid-cols-3">
          <div className="rounded-md border p-3">
            <Label className="mb-2 block">المشاريع ({projects.length})</Label>
            <div className="max-h-48 space-y-1 overflow-auto text-sm">
              {projects.map((p) => (
                <p key={p.id}>#{p.id} - {p.name}</p>
              ))}
              {!projects.length ? <p className="text-muted-foreground">لا توجد بيانات.</p> : null}
            </div>
          </div>
          <div className="rounded-md border p-3">
            <Label className="mb-2 block">التقويم ({events.length})</Label>
            <div className="max-h-48 space-y-1 overflow-auto text-sm">
              {events.map((e) => (
                <p key={e.id}>#{e.id} - {e.name}</p>
              ))}
              {!events.length ? <p className="text-muted-foreground">لا توجد بيانات.</p> : null}
            </div>
          </div>
          <div className="rounded-md border p-3">
            <Label className="mb-2 block">المستندات ({documents.length})</Label>
            <div className="max-h-48 space-y-1 overflow-auto text-sm">
              {documents.map((d) => (
                <p key={d.id}>#{d.id} - {d.name}</p>
              ))}
              {!documents.length ? <p className="text-muted-foreground">لا توجد بيانات.</p> : null}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

