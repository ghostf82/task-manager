 "use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import {
  archiveOdooEntityAction,
  createOdooCalendarEventAction,
  createOdooDocumentAction,
  createOdooProjectAction,
  createOdooTaskAction,
  cloneOdooCalendarEventsAction,
  deleteOdooEntityAction,
  exportOdooWorkspaceExcelAction,
  importOdooWorkspaceExcelAction,
  listOdooCalendarEventsAction,
  listOdooCalendarEventsDayAction,
  listOdooCalendarEventsMonthAction,
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
  responsibleId?: number;
  partnerIds: number[];
  location: string;
  description: string;
  active: boolean;
};

type DocumentRow = { id: number; name: string; type: string; createdAt: string; creator: string };

function cleanName(v: string): string {
  const x = String(v || "").trim();
  return x && x !== "—" && x !== "-" ? x : "";
}

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

function shiftToTargetMonth(input: string, sourceMonth: string, targetMonth: string): string {
  const d = parseOdooDateTime(input);
  if (!d) return input;
  const [srcY, srcM] = sourceMonth.split("-").map(Number);
  const [tgtY, tgtM] = targetMonth.split("-").map(Number);
  if (!srcY || !srcM || !tgtY || !tgtM) return input;
  const monthDelta = (tgtY - srcY) * 12 + (tgtM - srcM);
  const year = d.getFullYear();
  const month = d.getMonth();
  const day = d.getDate();
  const hours = d.getHours();
  const mins = d.getMinutes();
  const secs = d.getSeconds();

  const targetMonthIndex = month + monthDelta;
  const first = new Date(year, targetMonthIndex, 1, hours, mins, secs);
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const safeDay = Math.min(day, lastDay);
  const out = new Date(first.getFullYear(), first.getMonth(), safeDay, hours, mins, secs);
  return toOdooDateTime(out);
}

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
  const [mineOnly, setMineOnly] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);

  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);
  const [expandedProjectId, setExpandedProjectId] = useState<number | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<number | null>(null);
  const [expandedDocId, setExpandedDocId] = useState<number | null>(null);

  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [sourceMonth, setSourceMonth] = useState(new Date().toISOString().slice(0, 7));
  const [targetMonth, setTargetMonth] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 7);
  });
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<number[]>([]);
  const [monthEvents, setMonthEvents] = useState<CalendarRow[]>([]);
  const [selectedSourceDay, setSelectedSourceDay] = useState("");
  const [dayToCompare, setDayToCompare] = useState("");
  const [dayEvents, setDayEvents] = useState<CalendarRow[]>([]);

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

  function togglePerson(name: string) {
    setSelectedPeople((prev) => (prev.includes(name) ? prev.filter((v) => v !== name) : [...prev, name]));
  }

  function toggleCalendarPick(id: number) {
    setSelectedCalendarIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const peoplePool = useMemo(() => {
    const bag = new Set<string>();
    for (const t of tasks) {
      const c = cleanName(t.creator);
      const r = cleanName(t.responsible);
      if (c) bag.add(c);
      if (r) bag.add(r);
    }
    for (const p of projects) {
      const c = cleanName(p.creator);
      const m = cleanName(p.manager);
      if (c) bag.add(c);
      if (m) bag.add(m);
    }
    for (const e of events) {
      const c = cleanName(e.creator);
      const r = cleanName(e.responsible);
      if (c) bag.add(c);
      if (r) bag.add(r);
    }
    for (const d of documents) {
      const c = cleanName(d.creator);
      if (c) bag.add(c);
    }
    return [...bag].sort((a, b) => a.localeCompare(b, "ar"));
  }, [tasks, projects, events, documents]);

  const passPeople = (...names: string[]) => {
    if (!selectedPeople.length) return true;
    const normalized = names.map(cleanName).filter(Boolean);
    return normalized.some((n) => selectedPeople.includes(n));
  };

  const filteredTasks = tasks.filter((t) => passPeople(t.creator, t.responsible));
  const filteredProjects = projects.filter((p) => passPeople(p.creator, p.manager));
  const filteredEvents = events.filter((e) => passPeople(e.creator, e.responsible));
  const filteredDocuments = documents.filter((d) => passPeople(d.creator));

  const sourceMonthDays = useMemo(() => {
    const days = new Set<string>();
    for (const e of monthEvents) {
      const d = parseOdooDateTime(e.start);
      if (!d) continue;
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      days.add(k);
    }
    return [...days].sort((a, b) => a.localeCompare(b));
  }, [monthEvents]);

  const sourceMonthEvents = useMemo(() => {
    if (!selectedSourceDay) return monthEvents;
    return monthEvents.filter((e) => {
      const d = parseOdooDateTime(e.start);
      if (!d) return false;
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return k === selectedSourceDay;
    });
  }, [monthEvents, selectedSourceDay]);

  function loadSourceMonthEvents() {
    if (!sourceMonth) {
      toast.error("اختر شهر المصدر أولاً.");
      return;
    }
    start(async () => {
      const res = await listOdooCalendarEventsMonthAction({ yearMonth: sourceMonth, mineOnly: false });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setMonthEvents(res.events.filter((e) => passPeople(e.creator, e.responsible)));
      setSelectedSourceDay("");
      setSelectedCalendarIds([]);
      toast.success(`تم جلب ${res.events.length} حدثًا لشهر ${sourceMonth}.`);
    });
  }

  function loadSelectedDayEvents() {
    if (!dayToCompare) {
      toast.error("اختر يومًا أولاً.");
      return;
    }
    start(async () => {
      const res = await listOdooCalendarEventsDayAction({ day: dayToCompare, mineOnly: false });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setDayEvents(res.events.filter((e) => passPeople(e.creator, e.responsible)));
      toast.success(`تمت مطابقة يوم ${dayToCompare}: ${res.events.length} حدث من Odoo.`);
    });
  }

  function suggestEventAutomation(e: CalendarRow): string[] {
    const tips: string[] = [];
    const text = `${e.name} ${e.description}`.toLowerCase();
    if (text.includes("شهر") || text.includes("monthly") || text.includes("agenda")) {
      tips.push("يفضل تحويل هذا الحدث إلى قالب شهري قابل للنسخ الآلي.");
    }
    if (!cleanName(e.description)) {
      tips.push("أضف قائمة مهام قياسية داخل الوصف لتسهيل النسخ والتتبع.");
    } else if (e.description.split("\n").length >= 5) {
      tips.push("الوصف يحتوي نقاط متعددة؛ يمكن تقسيمها إلى checklist واضحة مع حالة إنجاز.");
    }
    if (!tips.length) {
      tips.push("الحدث جيد، ويمكن نسخه للشهر التالي مباشرة من قسم النسخ الشهري أدناه.");
    }
    return tips;
  }

  function cloneSelectedMonthEvents() {
    if (!sourceMonth || !targetMonth || sourceMonth === targetMonth) {
      toast.error("اختر شهر مصدر وهدف مختلفين.");
      return;
    }
    if (!selectedCalendarIds.length) {
      toast.error("اختر حدثًا واحدًا على الأقل لنسخه.");
      return;
    }
    start(async () => {
      const payload = sourceMonthEvents
        .filter((e) => selectedCalendarIds.includes(e.id))
        .map((row) => {
          const nextStart = shiftToTargetMonth(row.start, sourceMonth, targetMonth);
          const nextStop = shiftToTargetMonth(row.stop, sourceMonth, targetMonth);
          return {
            eventId: row.id,
            name: row.name,
            start: nextStart,
            stop: nextStop || nextStart,
            allday: row.allday,
            description: row.description,
            location: row.location,
            partnerIds: row.partnerIds,
            responsibleId: row.responsibleId,
          };
        });
      const cloned = await cloneOdooCalendarEventsAction({ events: payload });
      if (!cloned.ok) {
        toast.error(cloned.error);
        return;
      }
      setNeedsRefresh(true);
      toast.success(`تم نسخ ${cloned.copied} حدث إلى شهر ${targetMonth}.${cloned.failed ? ` فشل ${cloned.failed} حدث.` : ""}`);
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

        <div className="rounded-md border p-3">
          <Label className="mb-2 block">تصفية العرض بالأشخاص (من البيانات الحالية)</Label>
          <div className="mb-2 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setSelectedPeople(peoplePool)} disabled={pending || !peoplePool.length}>
              اختيار الكل
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setSelectedPeople([])} disabled={pending}>
              مسح التصفية
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {peoplePool.length ? (
              peoplePool.map((name) => (
                <Button
                  key={name}
                  type="button"
                  size="sm"
                  variant={selectedPeople.includes(name) ? "default" : "outline"}
                  onClick={() => togglePerson(name)}
                  disabled={pending}
                >
                  {name}
                </Button>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">اجلب البيانات أولاً لتظهر أسماء المنشئين/المسؤولين.</p>
            )}
          </div>
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
                <th className="py-2 text-start">المنشئ</th>
                <th className="py-2 text-start">المسؤول</th>
                <th className="py-2 text-start">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {!filteredTasks.length ? (
                <tr>
                  <td colSpan={8} className="py-3 text-center text-muted-foreground">
                    لا توجد نتائج حتى الآن.
                  </td>
                </tr>
              ) : (
                filteredTasks.map((t) => (
                  <Fragment key={`task-${t.id}`}>
                    <tr className="border-b">
                      <td className="py-2">{t.id}</td>
                      <td className="py-2">{t.name}</td>
                      <td className="py-2">{t.stage}</td>
                      <td className="py-2">{t.project}</td>
                      <td className="py-2">{t.deadline}</td>
                      <td className="py-2">{t.creator}</td>
                      <td className="py-2">{t.responsible}</td>
                      <td className="py-2">
                        <div className="flex flex-wrap gap-1">
                          <Button type="button" size="sm" variant="outline" onClick={() => setExpandedTaskId((id) => (id === t.id ? null : t.id))}>
                            {expandedTaskId === t.id ? "إخفاء" : "استعراض"}
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => editTaskRow(t)}>تعديل</Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => archiveEntity("project.task", t.id)}>أرشفة</Button>
                          <Button type="button" size="sm" variant="destructive" onClick={() => deleteEntity("project.task", t.id)}>حذف</Button>
                        </div>
                      </td>
                    </tr>
                    {expandedTaskId === t.id ? (
                      <tr key={`task-expanded-${t.id}`} className="border-b bg-muted/30">
                        <td colSpan={8} className="p-3">
                          <div className="grid gap-2 text-sm sm:grid-cols-2">
                            <p><span className="font-medium">عنوان المهمة:</span> {t.name}</p>
                            <p><span className="font-medium">المشروع:</span> {t.project}</p>
                            <p><span className="font-medium">المرحلة:</span> {t.stage}</p>
                            <p><span className="font-medium">الأولوية:</span> {t.priority || "—"}</p>
                            <p><span className="font-medium">المنشئ:</span> {t.creator}</p>
                            <p><span className="font-medium">المسؤول:</span> {t.responsible}</p>
                            <p><span className="font-medium">الحالة:</span> {t.active ? "نشطة" : "مؤرشفة"}</p>
                            <p><span className="font-medium">الاستحقاق:</span> {t.deadline}</p>
                            <p className="sm:col-span-2"><span className="font-medium">الوصف:</span> {t.description || "لا يوجد وصف."}</p>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="grid gap-2 lg:grid-cols-3">
          <div className="rounded-md border p-3">
            <Label className="mb-2 block">المشاريع ({filteredProjects.length})</Label>
            <div className="max-h-64 overflow-auto text-sm">
              {filteredProjects.map((p) => (
                <div key={p.id} className="mb-2 border-b pb-2">
                  <p>#{p.id} - {p.name}</p>
                  <p className="text-xs text-muted-foreground">المدير: {p.manager} | المنشئ: {p.creator}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Button type="button" size="sm" variant="outline" onClick={() => setExpandedProjectId((id) => (id === p.id ? null : p.id))}>
                      {expandedProjectId === p.id ? "إخفاء" : "استعراض"}
                    </Button>
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
                  {expandedProjectId === p.id ? (
                    <div className="mt-2 rounded-md bg-muted/40 p-2 text-xs space-y-1">
                      <p><span className="font-medium">الحالة:</span> {p.active ? "نشط" : "مؤرشف"}</p>
                      <p><span className="font-medium">الرؤية:</span> {p.visibility || "—"}</p>
                      <p><span className="font-medium">تاريخ الإنشاء:</span> {p.createdAt || "—"}</p>
                    </div>
                  ) : null}
                </div>
              ))}
              {!filteredProjects.length ? <p className="text-muted-foreground">لا توجد بيانات.</p> : null}
            </div>
          </div>
          <div className="rounded-md border p-3">
            <Label className="mb-2 block">التقويم ({filteredEvents.length})</Label>
            <div className="max-h-64 overflow-auto text-sm">
              {filteredEvents.map((e) => (
                <div key={e.id} className="mb-2 border-b pb-2">
                  <p>#{e.id} - {e.name}</p>
                  <p className="text-xs text-muted-foreground">{e.start} → {e.stop}</p>
                  <p className="text-xs text-muted-foreground">المسؤول: {e.responsible} | المنشئ: {e.creator}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Button type="button" size="sm" variant="outline" onClick={() => setExpandedEventId((id) => (id === e.id ? null : e.id))}>
                      {expandedEventId === e.id ? "إخفاء" : "استعراض"}
                    </Button>
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
                  {expandedEventId === e.id ? (
                    <div className="mt-2 rounded-md bg-muted/40 p-2 text-xs space-y-1">
                      <p><span className="font-medium">الموقع:</span> {e.location || "—"}</p>
                      <p><span className="font-medium">الوصف/الملاحظات:</span> {e.description || "لا توجد ملاحظات."}</p>
                      <p><span className="font-medium">الحضور (IDs):</span> {e.partnerIds.length ? e.partnerIds.join(", ") : "—"}</p>
                      <p><span className="font-medium">اقتراح تحسين:</span></p>
                      <ul className="list-disc ps-5">
                        {suggestEventAutomation(e).map((tip) => (
                          <li key={tip}>{tip}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ))}
              {!filteredEvents.length ? <p className="text-muted-foreground">لا توجد بيانات.</p> : null}
            </div>
          </div>
          <div className="rounded-md border p-3">
            <Label className="mb-2 block">المستندات ({filteredDocuments.length})</Label>
            <div className="max-h-64 overflow-auto text-sm">
              {filteredDocuments.map((d) => (
                <div key={d.id} className="mb-2 border-b pb-2">
                  <p>#{d.id} - {d.name}</p>
                  <p className="text-xs text-muted-foreground">النوع: {d.type || "—"} | المنشئ: {d.creator}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Button type="button" size="sm" variant="outline" onClick={() => setExpandedDocId((id) => (id === d.id ? null : d.id))}>
                      {expandedDocId === d.id ? "إخفاء" : "استعراض"}
                    </Button>
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
                  {expandedDocId === d.id ? (
                    <div className="mt-2 rounded-md bg-muted/40 p-2 text-xs space-y-1">
                      <p><span className="font-medium">نوع المستند:</span> {d.type || "—"}</p>
                      <p><span className="font-medium">تاريخ الإنشاء:</span> {d.createdAt || "—"}</p>
                    </div>
                  ) : null}
                </div>
              ))}
              {!filteredDocuments.length ? <p className="text-muted-foreground">لا توجد بيانات.</p> : null}
            </div>
          </div>
        </div>

        <div className="rounded-md border p-3 space-y-3">
          <Label className="block">مطابقة تفاصيل أي يوم (وليس شهرًا فقط)</Label>
          <p className="text-xs text-muted-foreground">
            اختر أي تاريخ، وسنجلب أحداثه من Odoo مع الوصف/الأجندة والموقع والمسؤولين لتظهر التفاصيل بدقة.
          </p>
          <div className="flex flex-wrap gap-2">
            <Input type="date" value={dayToCompare} onChange={(e) => setDayToCompare(e.target.value)} className="w-44" />
            <Button type="button" variant="outline" onClick={loadSelectedDayEvents} disabled={pending}>
              مطابقة اليوم المحدد
            </Button>
          </div>
          <div className="max-h-56 overflow-auto rounded-md border p-2 space-y-2">
            {dayEvents.length ? (
              dayEvents.map((e) => (
                <div key={`day-${e.id}`} className="rounded-md border border-border/60 p-2 text-sm">
                  <p className="font-medium">#{e.id} - {e.name}</p>
                  <p className="text-xs text-muted-foreground">{e.start} → {e.stop}</p>
                  <p className="text-xs"><span className="font-medium">المسؤول:</span> {e.responsible || "—"}</p>
                  <p className="text-xs"><span className="font-medium">الموقع:</span> {e.location || "—"}</p>
                  <p className="text-xs whitespace-pre-wrap"><span className="font-medium">الأجندة/الملاحظات:</span> {e.description || "لا توجد ملاحظات."}</p>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">لا توجد بيانات لهذا اليوم بعد. اختر تاريخًا واضغط «مطابقة اليوم المحدد».</p>
            )}
          </div>
        </div>

        <div className="rounded-md border p-3 space-y-3">
          <Label className="block">نسخ مهام/أحداث الشهر السابق للشهر الجديد</Label>
          <p className="text-xs text-muted-foreground">
            هذه الميزة تساعدك على تكرار أعمال الأجندة الشهرية بدل الإدخال اليدوي. اختر المصدر والهدف ثم حدّد الأحداث التي تريد نسخها.
          </p>
          <div className="flex flex-wrap gap-2">
            <Input type="month" value={sourceMonth} onChange={(e) => setSourceMonth(e.target.value)} className="w-44" />
            <Input type="month" value={targetMonth} onChange={(e) => setTargetMonth(e.target.value)} className="w-44" />
            <Button type="button" variant="outline" onClick={loadSourceMonthEvents} disabled={pending}>
              جلب كل أيام شهر المصدر
            </Button>
            <Button type="button" variant="outline" onClick={() => setSelectedCalendarIds(sourceMonthEvents.map((e) => e.id))}>
              اختيار كل أحداث شهر المصدر
            </Button>
            <Button type="button" variant="outline" onClick={() => setSelectedCalendarIds([])}>
              إلغاء الاختيار
            </Button>
            <Button type="button" onClick={cloneSelectedMonthEvents} disabled={pending}>
              نسخ المحدد إلى الشهر الهدف
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {sourceMonthDays.length ? (
              sourceMonthDays.map((day) => (
                <Button
                  key={day}
                  type="button"
                  size="sm"
                  variant={selectedSourceDay === day ? "default" : "outline"}
                  onClick={() => setSelectedSourceDay((curr) => (curr === day ? "" : day))}
                >
                  {day}
                </Button>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">بعد الجلب ستظهر كل أيام الشهر هنا لتختار اليوم المناسب (مثل نهاية الشهر).</p>
            )}
          </div>
          <div className="max-h-56 overflow-auto rounded-md border p-2 space-y-2">
            {sourceMonthEvents.length ? (
              sourceMonthEvents.map((e) => (
                <label key={e.id} className="flex items-start gap-2 rounded-md border border-border/60 p-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedCalendarIds.includes(e.id)}
                    onChange={() => toggleCalendarPick(e.id)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block">#{e.id} - {e.name} ({e.start})</span>
                    <span className="block text-xs text-muted-foreground">
                      {e.description ? e.description.slice(0, 180) : "لا توجد ملاحظات داخل الحدث"}
                    </span>
                  </span>
                </label>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">لا توجد أحداث في شهر المصدر ضمن النتائج الحالية.</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

