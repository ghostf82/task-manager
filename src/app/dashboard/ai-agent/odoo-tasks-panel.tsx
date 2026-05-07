"use client";

import { useState, useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import {
  archiveOdooEntityAction,
  createOdooCalendarEventAction,
  createOdooDocumentAction,
  createOdooProjectAction,
  createOdooTaskAction,
  deleteOdooEntityAction,
  exportOdooWorkspaceExcelAction,
  importOdooWorkspaceExcelAction,
  listOdooCalendarEventsAction,
  listOdooDocumentsAction,
  listOdooProjectsAction,
  listOdooTasksAction,
  listOdooWorkspaceAllAction,
  updateOdooCalendarEventAction,
  updateOdooDocumentAction,
  updateOdooProjectAction,
  updateOdooTaskAction,
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
  creator: string;
  responsible: string;
  assigneeIds: number[];
  description: string;
  priority: string;
  active: boolean;
};

type ProjectRow = {
  id: number;
  name: string;
  active: boolean;
  creator: string;
  manager: string;
  visibility: string;
  createdAt: string;
};
type CalendarRow = {
  id: number;
  name: string;
  start: string;
  stop: string;
  allday: boolean;
  creator: string;
  responsible: string;
  partnerIds: number[];
  location: string;
  description: string;
  active: boolean;
};
type DocumentRow = { id: number; name: string; type: string; createdAt: string; creator: string };

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
  const [selectedDetails, setSelectedDetails] = useState<Record<string, unknown> | null>(null);
  const [mineOnly, setMineOnly] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);

  function showDetails(data: Record<string, unknown>) {
    setSelectedDetails(data);
    if (typeof window !== "undefined") {
      setTimeout(() => {
        document.getElementById("odoo-record-details")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 10);
    }
  }

  function loadTasks() {
    start(async () => {
      const res = await listOdooTasksAction({ text: query, limit: 50, mineOnly });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setTasks(res.tasks);
      setNeedsRefresh(false);
      toast.success(`تم جلب ${res.tasks.length} مهمة من Odoo.`);
    });
  }

  function loadAll() {
    start(async () => {
      const res = await listOdooWorkspaceAllAction({ text: query, mineOnly });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setTasks(res.tasks);
      setProjects(res.projects);
      setEvents(res.events);
      setDocuments(res.documents);
      setNeedsRefresh(false);
      toast.success(
        `تم جلب الكل: ${res.tasks.length} مهمة، ${res.projects.length} مشروع، ${res.events.length} حدث، ${res.documents.length} مستند.`
      );
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
      setNeedsRefresh(true);
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
      setNeedsRefresh(true);
    });
  }

  function editTaskRow(row: TaskRow) {
    const nextName = prompt("اسم المهمة", row.name) ?? row.name;
    const nextDesc = prompt("الوصف", row.description ?? "") ?? row.description;
    const nextDeadline = prompt("تاريخ الاستحقاق YYYY-MM-DD", row.deadline === "—" ? "" : row.deadline) ?? "";
    start(async () => {
      const res = await updateOdooTaskAction({
        taskId: row.id,
        name: nextName.trim(),
        description: nextDesc,
        deadline: nextDeadline.trim() || undefined,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message);
      setNeedsRefresh(true);
    });
  }

  function archiveEntity(model: "project.task" | "project.project" | "calendar.event" | "documents.document" | "ir.attachment", id: number) {
    start(async () => {
      const res = await archiveOdooEntityAction({ model, id });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message);
      setNeedsRefresh(true);
    });
  }

  function deleteEntity(model: "project.task" | "project.project" | "calendar.event" | "documents.document" | "ir.attachment", id: number) {
    start(async () => {
      let res = await deleteOdooEntityAction({ model, id });
      if (!res.ok && model === "documents.document") {
        res = await deleteOdooEntityAction({ model: "ir.attachment", id });
      }
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message);
      setNeedsRefresh(true);
    });
  }

  function loadProjects() {
    start(async () => {
      const res = await listOdooProjectsAction({ text: query, limit: 100, mineOnly });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setProjects(res.projects);
      setNeedsRefresh(false);
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
      setNeedsRefresh(true);
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
      setNeedsRefresh(true);
    });
  }

  function loadCalendar() {
    start(async () => {
      const res = await listOdooCalendarEventsAction({ text: query, limit: 100, mineOnly });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setEvents(res.events);
      setNeedsRefresh(false);
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
      setNeedsRefresh(true);
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
      setNeedsRefresh(true);
    });
  }

  function loadDocuments() {
    start(async () => {
      const res = await listOdooDocumentsAction({ text: query, limit: 100, mineOnly });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setDocuments(res.documents);
      setNeedsRefresh(false);
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
      setNeedsRefresh(true);
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
      setNeedsRefresh(true);
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
        setNeedsRefresh(true);
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
          <Button type="button" onClick={loadAll} disabled={pending}>
            جلب الكل
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
          <Button
            type="button"
            variant={needsRefresh ? "default" : "outline"}
            onClick={loadAll}
            disabled={pending}
          >
            تحديث الآن
          </Button>
          <Button
            type="button"
            variant={mineOnly ? "default" : "outline"}
            onClick={() => setMineOnly((v) => !v)}
            disabled={pending}
          >
            {mineOnly ? "فلتر: ما يخصني" : "فلتر: الكل"}
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
        {needsRefresh ? (
          <p className="text-xs text-amber-600">
            توجد تغييرات جديدة. اضغط &quot;تحديث الآن&quot; عند الانتهاء من جميع الإجراءات.
          </p>
        ) : null}

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
                <th className="py-2 text-start">المنشئ</th>
                <th className="py-2 text-start">المسؤول</th>
                <th className="py-2 text-start">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {!tasks.length ? (
                <tr>
                  <td colSpan={8} className="py-3 text-center text-muted-foreground">
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
                    <td className="py-2">{t.creator}</td>
                    <td className="py-2">{t.responsible}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        <Button type="button" size="sm" variant="outline" onClick={() => showDetails(t as unknown as Record<string, unknown>)}>استعراض</Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => editTaskRow(t)}>تعديل</Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => archiveEntity("project.task", t.id)}>أرشفة</Button>
                        <Button type="button" size="sm" variant="destructive" onClick={() => deleteEntity("project.task", t.id)}>حذف</Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="grid gap-2 lg:grid-cols-3">
          <div className="rounded-md border p-3">
            <Label className="mb-2 block">المشاريع ({projects.length})</Label>
            <div className="max-h-64 overflow-auto text-sm">
              {projects.map((p) => (
                <div key={p.id} className="mb-2 border-b pb-2">
                  <p>#{p.id} - {p.name}</p>
                  <p className="text-xs text-muted-foreground">المدير: {p.manager} | المنشئ: {p.creator}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Button type="button" size="sm" variant="outline" onClick={() => showDetails(p as unknown as Record<string, unknown>)}>استعراض</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => {
                      const next = prompt("اسم المشروع الجديد", p.name) ?? p.name;
                      start(async () => {
                        const res = await updateOdooProjectAction({ projectId: p.id, name: next });
                        if (!res.ok) {
                          toast.error(res.error);
                          return;
                        }
                        toast.success(res.message);
                        setNeedsRefresh(true);
                      });
                    }}>تعديل</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => archiveEntity("project.project", p.id)}>أرشفة</Button>
                    <Button type="button" size="sm" variant="destructive" onClick={() => deleteEntity("project.project", p.id)}>حذف</Button>
                  </div>
                </div>
              ))}
              {!projects.length ? <p className="text-muted-foreground">لا توجد بيانات.</p> : null}
            </div>
          </div>
          <div className="rounded-md border p-3">
            <Label className="mb-2 block">التقويم ({events.length})</Label>
            <div className="max-h-64 overflow-auto text-sm">
              {events.map((e) => (
                <div key={e.id} className="mb-2 border-b pb-2">
                  <p>#{e.id} - {e.name}</p>
                  <p className="text-xs text-muted-foreground">{e.start} → {e.stop}</p>
                  <p className="text-xs text-muted-foreground">المسؤول: {e.responsible} | المنشئ: {e.creator}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Button type="button" size="sm" variant="outline" onClick={() => showDetails(e as unknown as Record<string, unknown>)}>استعراض</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => {
                      const next = prompt("اسم الحدث الجديد", e.name) ?? e.name;
                      start(async () => {
                        const res = await updateOdooCalendarEventAction({ eventId: e.id, name: next });
                        if (!res.ok) {
                          toast.error(res.error);
                          return;
                        }
                        toast.success(res.message);
                        setNeedsRefresh(true);
                      });
                    }}>تعديل</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => archiveEntity("calendar.event", e.id)}>أرشفة</Button>
                    <Button type="button" size="sm" variant="destructive" onClick={() => deleteEntity("calendar.event", e.id)}>حذف</Button>
                  </div>
                </div>
              ))}
              {!events.length ? <p className="text-muted-foreground">لا توجد بيانات.</p> : null}
            </div>
          </div>
          <div className="rounded-md border p-3">
            <Label className="mb-2 block">المستندات ({documents.length})</Label>
            <div className="max-h-64 overflow-auto text-sm">
              {documents.map((d) => (
                <div key={d.id} className="mb-2 border-b pb-2">
                  <p>#{d.id} - {d.name}</p>
                  <p className="text-xs text-muted-foreground">النوع: {d.type || "—"} | المنشئ: {d.creator}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Button type="button" size="sm" variant="outline" onClick={() => showDetails(d as unknown as Record<string, unknown>)}>استعراض</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => {
                      const next = prompt("اسم المستند الجديد", d.name) ?? d.name;
                      start(async () => {
                        const res = await updateOdooDocumentAction({ documentId: d.id, name: next });
                        if (!res.ok) {
                          toast.error(res.error);
                          return;
                        }
                        toast.success(res.message);
                        setNeedsRefresh(true);
                      });
                    }}>تعديل</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => archiveEntity("documents.document", d.id)}>أرشفة</Button>
                    <Button type="button" size="sm" variant="destructive" onClick={() => deleteEntity("documents.document", d.id)}>حذف</Button>
                  </div>
                </div>
              ))}
              {!documents.length ? <p className="text-muted-foreground">لا توجد بيانات.</p> : null}
            </div>
          </div>
        </div>

        <div id="odoo-record-details" className="rounded-md border p-3">
          <Label className="mb-2 block">تفاصيل السجل المحدد</Label>
          {selectedDetails ? (
            <pre className="max-h-72 overflow-auto rounded bg-muted p-2 text-xs" dir="ltr">
              {JSON.stringify(selectedDetails, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">اضغط استعراض على أي سطر لعرض التفاصيل الكاملة.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

