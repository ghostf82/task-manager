"use client";

import type { Dispatch, SetStateAction } from "react";
import { Fragment, useMemo, useState, useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { CalendarDeepCopyDialog } from "@/app/dashboard/ai-agent/calendar-deep-copy-dialog";
import {
  archiveOdooEntityAction,
  createOdooCalendarEventAction,
  createOdooDocumentAction,
  createOdooProjectAction,
  createOdooTaskAction,
  cloneOdooCalendarEventsAction,
  hydrateOdooCalendarAgendaAction,
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
  resModel: string;
  resId: number | null;
  agendaLines: Array<{ id: number; summary: string; note: string; state: string; dateDeadline: string }>;
  agendaItems: Array<{ id: number; sequence: number; name: string; description: string; discussed: boolean }>;
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

function dayKeyFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function localDayBounds(dayKey: string): { start: Date; end: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return null;
  const [y, m, d] = dayKey.split("-").map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
  return { start, end };
}

/** True if the event intersects [day 00:00, next day 00:00) in local time (matches typical Odoo calendar day grouping). */
function eventOverlapsLocalDay(e: CalendarRow, dayKey: string): boolean {
  const bounds = localDayBounds(dayKey);
  if (!bounds) return false;
  const st = parseOdooDateTime(e.start);
  if (!st) return false;
  const en = parseOdooDateTime(e.stop) ?? st;
  return en > bounds.start && st < bounds.end;
}

/** Calendar day keys (YYYY-MM-DD) touched by the event within a given YYYY-MM month. */
function dayKeysOfEventInMonth(e: CalendarRow, ym: string): string[] {
  const st = parseOdooDateTime(e.start);
  if (!st) return [];
  const en = parseOdooDateTime(e.stop) ?? st;
  const rangeStart = new Date(st.getFullYear(), st.getMonth(), st.getDate());
  const rangeEnd = new Date(en.getFullYear(), en.getMonth(), en.getDate());
  if (rangeStart > rangeEnd) return [];
  const [Y, M] = ym.split("-").map(Number);
  if (!Y || !M) return [];
  const monthStart = new Date(Y, M - 1, 1);
  const monthEnd = new Date(Y, M, 0);
  const walkStart = rangeStart > monthStart ? rangeStart : monthStart;
  const walkEnd = rangeEnd < monthEnd ? rangeEnd : monthEnd;
  if (walkStart > walkEnd) return [];
  const keys: string[] = [];
  const cur = new Date(walkStart);
  while (cur <= walkEnd) {
    keys.push(dayKeyFromDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return keys;
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

type HydratedAgendaRow = {
  eventId: number;
  agendaLines: Array<{ id: number; summary: string; note: string; state: string; dateDeadline: string }>;
  agendaItems: Array<{ id: number; sequence: number; name: string; description: string; discussed: boolean }>;
};

/** Must stay ≤ `HYDRATE_CALENDAR_AGENDA_MAX_IDS` in `actions.ts`. */
const CALENDAR_AGENDA_CHUNK = 28;

function mergeAgendaIntoCalendarRows(prev: CalendarRow[], rows: HydratedAgendaRow[]): CalendarRow[] {
  const by = new Map(rows.map((r) => [r.eventId, r]));
  return prev.map((ev) => {
    const r = by.get(ev.id);
    if (!r) return ev;
    return { ...ev, agendaLines: r.agendaLines, agendaItems: r.agendaItems };
  });
}

async function pullAgendaChunksToSetState(
  ids: number[],
  setRows: Dispatch<SetStateAction<CalendarRow[]>>
): Promise<boolean> {
  const unique = [...new Set(ids.filter((n) => Number.isFinite(n) && n > 0))];
  for (let i = 0; i < unique.length; i += CALENDAR_AGENDA_CHUNK) {
    const slice = unique.slice(i, i + CALENDAR_AGENDA_CHUNK);
    const h = await hydrateOdooCalendarAgendaAction({ eventIds: slice });
    if (!h.ok) {
      toast.error(h.error);
      return false;
    }
    setRows((prev) => mergeAgendaIntoCalendarRows(prev, h.rows));
  }
  return true;
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
  /** Staged agenda fetch after bulk month/day list (avoids one huge Odoo payload → Netlify 504). */
  const [agendaHydrate, setAgendaHydrate] = useState<"idle" | "month" | "day">("idle");
  const [deepCopySource, setDeepCopySource] = useState<CalendarRow | null>(null);

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
      for (const k of dayKeysOfEventInMonth(e, sourceMonth)) days.add(k);
    }
    return [...days].sort((a, b) => a.localeCompare(b));
  }, [monthEvents, sourceMonth]);

  const sourceMonthEvents = useMemo(() => {
    if (!selectedSourceDay) return monthEvents;
    return monthEvents.filter((e) => eventOverlapsLocalDay(e, selectedSourceDay));
  }, [monthEvents, selectedSourceDay]);

  function loadSourceMonthEvents() {
    if (!sourceMonth) {
      toast.error("اختر شهر المصدر أولاً.");
      return;
    }
    start(async () => {
      setAgendaHydrate("month");
      try {
        const res = await listOdooCalendarEventsMonthAction({ yearMonth: sourceMonth, mineOnly: false });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        const visible = res.events.filter((e) => passPeople(e.creator, e.responsible));
        setMonthEvents(visible);
        setSelectedSourceDay("");
        setSelectedCalendarIds([]);
        if (!visible.length) {
          toast.success(
            `تم جلب ${res.events.length} حدثًا لشهر ${sourceMonth} (لا يظهر شيء بعد تصفية الأشخاص المختارين).`
          );
          return;
        }
        const ok = await pullAgendaChunksToSetState(
          visible.map((e) => e.id),
          setMonthEvents
        );
        toast.success(
          ok
            ? `تم جلب ${res.events.length} حدثًا لشهر ${sourceMonth} مع بنود الأجندة (${visible.length} معروضًا بعد التصفية).`
            : `تم جلب أحداث الشهر لكن تعذّر إكمال تحميل الأجندة — راجع رسالة الخطأ أعلاه.`
        );
      } finally {
        setAgendaHydrate("idle");
      }
    });
  }

  function loadSelectedDayEvents() {
    if (!dayToCompare) {
      toast.error("اختر يومًا أولاً.");
      return;
    }
    start(async () => {
      setAgendaHydrate("day");
      try {
        const res = await listOdooCalendarEventsDayAction({ day: dayToCompare, mineOnly: false });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        const visible = res.events.filter((e) => passPeople(e.creator, e.responsible));
        setDayEvents(visible);
        if (!visible.length) {
          toast.success(
            `تمت مطابقة يوم ${dayToCompare}: ${res.events.length} حدث من Odoo (لا يظهر شيء بعد تصفية الأشخاص).`
          );
          return;
        }
        const ok = await pullAgendaChunksToSetState(
          visible.map((e) => e.id),
          setDayEvents
        );
        toast.success(
          ok
            ? `تمت مطابقة يوم ${dayToCompare}: ${res.events.length} حدث من Odoo مع الأجندة (${visible.length} معروضًا).`
            : `تم جلب أحداث اليوم لكن تعذّر إكمال تحميل الأجندة — راجع رسالة الخطأ أعلاه.`
        );
      } finally {
        setAgendaHydrate("idle");
      }
    });
  }

  function suggestEventAutomation(e: CalendarRow): string[] {
    const tips: string[] = [];
    const agendaText = (e.agendaLines ?? []).map((a) => `${a.summary} ${a.note}`).join(" ");
    const itemsText = (e.agendaItems ?? []).map((it) => `${it.name} ${it.description}`).join(" ");
    const text = `${e.name} ${e.description} ${agendaText} ${itemsText}`.toLowerCase();
    if (text.includes("شهر") || text.includes("monthly") || text.includes("agenda")) {
      tips.push("يفضل تحويل هذا الحدث إلى قالب شهري قابل للنسخ الآلي.");
    }
    if (!(e.agendaItems?.length || e.agendaLines?.length) && !cleanName(e.description)) {
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
      // One server action per event avoids Netlify 504 when each event triggers many Odoo RPCs (agenda lines).
      const toastId = toast.loading(`جاري نسخ ${payload.length} حدثًا إلى ${targetMonth}…`);
      let totalCopied = 0;
      let totalFailed = 0;
      let totalAgendaTable = 0;
      let totalAgendaMail = 0;
      let totalFallback = 0;
      const errors: string[] = [];
      try {
        for (const row of payload) {
          const cloned = await cloneOdooCalendarEventsAction({ events: [row] });
          if (!cloned.ok) {
            errors.push(cloned.error);
            totalFailed += 1;
            continue;
          }
          totalCopied += cloned.copied;
          totalFailed += cloned.failed;
          totalAgendaTable += cloned.agendaTableItemsCreated;
          totalAgendaMail += cloned.agendaActivitiesCreated;
          totalFallback += cloned.agendaDescriptionFallbackCount;
        }
      } finally {
        toast.dismiss(toastId);
      }
      if (totalCopied === 0) {
        toast.error(errors[0] ?? "فشل نسخ التقويم.");
        return;
      }
      setNeedsRefresh(true);
      const parts = [
        `تم نسخ ${totalCopied} من أصل ${payload.length} إلى شهر ${targetMonth}.`,
        totalFailed ? `فشل ${totalFailed}.` : null,
        totalAgendaTable ? `جدول أجندة: ${totalAgendaTable} سطرًا.` : null,
        totalAgendaMail ? `أنشطة بريد: ${totalAgendaMail}.` : null,
        totalFallback ? `لُصق وصف احتياطي لـ ${totalFallback} حدث.` : null,
      ]
        .filter(Boolean)
        .join(" ");
      toast.success(parts);
      if (errors.length) {
        toast.error(`فشل ${errors.length} حدثًا: ${errors[errors.length - 1]}`);
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
                      {e.resModel ? (
                        <p>
                          <span className="font-medium">مرتبط بسجل Odoo:</span> {e.resModel}
                          {e.resId != null ? ` #${e.resId}` : ""} (مثال: hr.leave لإجازة تظهر كحدث تقويم)
                        </p>
                      ) : null}
                      <p><span className="font-medium">الموقع:</span> {e.location || "—"}</p>
                      <p className="whitespace-pre-wrap"><span className="font-medium">الوصف/الملاحظات:</span> {e.description || "لا توجد ملاحظات."}</p>
                      {e.agendaItems?.length ? (
                        <div className="space-y-1">
                          <p className="font-medium">جدول الأجندة (calendar.event.agenda.item):</p>
                          <ul className="list-disc ps-4 space-y-0.5">
                            {e.agendaItems.map((it) => (
                              <li key={it.id}>
                                {it.name || "—"}
                                {it.description ? (
                                  <span className="text-muted-foreground"> — {it.description}</span>
                                ) : null}
                                <span className="text-muted-foreground"> [{it.discussed ? "تمت المناقشة" : "لم تُناقش"}]</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {e.agendaLines?.length ? (
                        <div className="space-y-1">
                          <p className="font-medium">بنود الأجندة (mail.activity على الاجتماع):</p>
                          <ul className="list-disc ps-4 space-y-0.5">
                            {e.agendaLines.map((a) => (
                              <li key={a.id}>
                                {a.summary || "—"}
                                {a.note ? <span className="text-muted-foreground"> — {a.note}</span> : null}
                                <span className="text-muted-foreground">
                                  {" "}
                                  [{a.state === "done" ? "تمت المناقشة" : a.state}]
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
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
            اختر أي تاريخ، وسنجلب أحداثه من Odoo (الوصف والموقع والمسؤولين)، ثم نحمّل بنود الأجندة وجدول Odoo على دفعات صغيرة لتجنّب انتهاء مهلة الخادم.
          </p>
          <div className="flex flex-wrap gap-2">
            <Input type="date" value={dayToCompare} onChange={(e) => setDayToCompare(e.target.value)} className="w-44" />
            <Button
              type="button"
              variant="outline"
              onClick={loadSelectedDayEvents}
              disabled={pending || agendaHydrate !== "idle"}
            >
              مطابقة اليوم المحدد
            </Button>
          </div>
          <div className="max-h-56 overflow-auto rounded-md border p-2 space-y-2">
            {dayEvents.length ? (
              dayEvents.map((e) => (
                <div key={`day-${e.id}`} className="rounded-md border border-border/60 p-2 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-medium">#{e.id} - {e.name}</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="shrink-0"
                      disabled={pending || agendaHydrate !== "idle"}
                      onClick={() => setDeepCopySource(e)}
                    >
                      نسخ عميق…
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{e.start} → {e.stop}</p>
                  {e.resModel ? (
                    <p className="text-xs text-muted-foreground">
                      مرتبط: {e.resModel}
                      {e.resId != null ? ` #${e.resId}` : ""}
                    </p>
                  ) : null}
                  <p className="text-xs"><span className="font-medium">المسؤول:</span> {e.responsible || "—"}</p>
                  <p className="text-xs"><span className="font-medium">الموقع:</span> {e.location || "—"}</p>
                  <p className="text-xs whitespace-pre-wrap"><span className="font-medium">الوصف:</span> {e.description || "لا توجد ملاحظات في الوصف."}</p>
                  {e.agendaItems?.length ? (
                    <div className="mt-1 text-xs border-t border-border/50 pt-1">
                      <p className="font-medium mb-0.5">جدول الأجندة (Odoo):</p>
                      <ul className="list-disc ps-4 space-y-0.5">
                        {e.agendaItems.map((it) => (
                          <li key={it.id}>
                            {it.name || "—"}
                            {it.description ? <span className="text-muted-foreground"> — {it.description}</span> : null}
                            <span className="text-muted-foreground"> [{it.discussed ? "مناقش" : "—"}]</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {e.agendaLines?.length ? (
                    <div className="mt-1 text-xs border-t border-border/50 pt-1">
                      <p className="font-medium mb-0.5">أنشطة بريد مرتبطة بالاجتماع:</p>
                      <ul className="list-disc ps-4 space-y-0.5">
                        {e.agendaLines.map((a) => (
                          <li key={a.id}>
                            {a.summary || "—"}
                            {a.note ? <span className="text-muted-foreground"> — {a.note}</span> : null}
                            <span className="text-muted-foreground"> [{a.state === "done" ? "مناقش" : a.state}]</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {!e.agendaItems?.length && !e.agendaLines?.length ? (
                    <p className="text-xs text-muted-foreground mt-1">لا توجد بنود أجندة في جدول Odoo ولا أنشطة بريد على هذا الحدث.</p>
                  ) : null}
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
            هذه الميزة تساعدك على تكرار أعمال الأجندة الشهرية بدل الإدخال اليدوي. بعد جلب الأحداث يُحمّل جدول الأجندة من Odoo على دفعات (نفس الحقول: <code className="text-[10px]">calendar.event.agenda.item</code> و<code className="text-[10px]">mail.activity</code>).
          </p>
          <div className="flex flex-wrap gap-2">
            <Input type="month" value={sourceMonth} onChange={(e) => setSourceMonth(e.target.value)} className="w-44" />
            <Input type="month" value={targetMonth} onChange={(e) => setTargetMonth(e.target.value)} className="w-44" />
            <Button
              type="button"
              variant="outline"
              onClick={loadSourceMonthEvents}
              disabled={pending || agendaHydrate !== "idle"}
            >
              جلب كل أيام شهر المصدر
            </Button>
            <Button type="button" variant="outline" onClick={() => setSelectedCalendarIds(sourceMonthEvents.map((e) => e.id))}>
              اختيار كل أحداث شهر المصدر
            </Button>
            <Button type="button" variant="outline" onClick={() => setSelectedCalendarIds([])}>
              إلغاء الاختيار
            </Button>
            <Button type="button" onClick={cloneSelectedMonthEvents} disabled={pending || agendaHydrate !== "idle"}>
              نسخ المحدد إلى الشهر الهدف
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            للتحكم الدقيق بتاريخ الوجهة وتعديل العنوان قبل النسخ، استخدم «نسخ عميق» بجانب الحدث (حدث واحد في كل مرة).
          </p>
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
                <div
                  key={e.id}
                  className="flex flex-wrap items-start gap-2 rounded-md border border-border/60 p-2 text-sm"
                >
                  <input
                    id={`cal-month-${e.id}`}
                    type="checkbox"
                    checked={selectedCalendarIds.includes(e.id)}
                    onChange={() => toggleCalendarPick(e.id)}
                    className="mt-1 shrink-0"
                  />
                  <label htmlFor={`cal-month-${e.id}`} className="min-w-0 flex-1 cursor-pointer">
                    <span className="block">#{e.id} - {e.name} ({e.start} → {e.stop})</span>
                    {e.resModel ? (
                      <span className="block text-xs text-muted-foreground">مرتبط: {e.resModel}{e.resId != null ? ` #${e.resId}` : ""}</span>
                    ) : null}
                    <span className="block text-xs text-muted-foreground">
                      {e.description ? e.description.slice(0, 180) : "لا توجد ملاحظات في الوصف"}
                      {e.agendaItems?.length ? ` — ${e.agendaItems.length} بند جدول أجندة` : ""}
                      {e.agendaLines?.length ? ` — ${e.agendaLines.length} نشاط بريد` : ""}
                    </span>
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="shrink-0"
                    disabled={pending || agendaHydrate !== "idle"}
                    onClick={() => setDeepCopySource(e)}
                  >
                    نسخ عميق…
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">لا توجد أحداث في شهر المصدر ضمن النتائج الحالية.</p>
            )}
          </div>
        </div>
      </CardContent>
      <CalendarDeepCopyDialog
        open={deepCopySource !== null}
        onOpenChange={(o) => {
          if (!o) setDeepCopySource(null);
        }}
        source={
          deepCopySource
            ? {
                id: deepCopySource.id,
                name: deepCopySource.name,
                start: deepCopySource.start,
                stop: deepCopySource.stop,
                allday: deepCopySource.allday,
                description: deepCopySource.description,
                location: deepCopySource.location,
                partnerIds: deepCopySource.partnerIds,
                responsibleId: deepCopySource.responsibleId,
              }
            : null
        }
        onCompleted={() => {
          setNeedsRefresh(true);
          setDeepCopySource(null);
        }}
      />
    </Card>
  );
}

