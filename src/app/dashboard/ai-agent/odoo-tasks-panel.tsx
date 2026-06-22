"use client";

import type { Dispatch, SetStateAction } from "react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { CalendarDeepCopyDialog } from "@/app/dashboard/ai-agent/calendar-deep-copy-dialog";
import { OdooTaskExpandedDetail } from "@/app/dashboard/ai-agent/odoo-task-expanded-detail";
import type { OdooTaskStageOption, OdooTaskUiRow, OdooUserOption } from "@/lib/integrations/odoo-task-ui-types";
import {
  archiveOdooEntityAction,
  cloneOdooCalendarEventPhaseOneAction,
  createOdooCalendarEventAction,
  createOdooDocumentAction,
  createOdooProjectAction,
  createOdooTaskAction,
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
  listOdooTaskStagesAction,
  listOdooUsersAction,
  listOdooWorkspaceAllAction,
  updateOdooCalendarEventAction,
  updateOdooDocumentAction,
  updateOdooProjectAction,
  updateOdooTaskAction,
  updateOdooTaskStageAction,
  revalidateAiAgentOdooPanelAction,
} from "@/app/dashboard/ai-agent/actions";
import { copyOdooMeetingAgendaInSlices } from "@/app/dashboard/ai-agent/odoo-calendar-agenda-copy-batches";
import { Button } from "@/components/ui/button";
import {
  buildProjectIntelMap,
  eventInCalendarRange,
  type CalendarRange,
} from "@/lib/command-center/odoo-workspace-intelligence";
import {
  applyProjectWorkspaceFilter,
  applyTaskWorkspaceFilter,
  type OdooWorkspaceFilter,
} from "@/lib/command-center/odoo-workspace-filters";
import { OdooDocumentsExplorer, type OdooFolderRow } from "@/app/dashboard/odoo/odoo-documents-explorer";
import type { OdooDocumentsExplorerMode } from "@/lib/integrations/odoo-documents-constants";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ProjectRow = {
  id: number;
  name: string;
  active: boolean;
  creator: string;
  manager: string;
  visibility: string;
  createdAt: string;
  partner?: string;
  descriptionPlain?: string;
  dateStart?: string;
  dateEnd?: string;
  tags?: string[];
  taskCount?: number;
  openTaskCount?: number;
  overdueTaskCount?: number;
  linkedEventCount?: number;
  linkedDocumentCount?: number;
  hasNoTasks?: boolean;
  isStalled?: boolean;
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
  partners?: Array<{ id: number; name: string }>;
  location: string;
  description: string;
  active: boolean;
  resModel: string;
  resId: number | null;
  agendaLines: Array<{ id: number; summary: string; note: string; state: string; dateDeadline: string }>;
  agendaItems: Array<{ id: number; sequence: number; name: string; description: string; discussed: boolean }>;
};

type DocumentRow = {
  id: number;
  name: string;
  type: string;
  mimetype: string;
  createdAt: string;
  creator: string;
};

export type OdooTasksPanelProps = {
  initialWorkspace?: {
    tasks: unknown;
    projects: unknown;
    events: unknown;
    documents: unknown;
    folders?: unknown;
    meta?: unknown;
  } | null;
  initialLastSyncAt?: string | null;
  odooBaseUrl?: string | null;
  /** When set, only render this workspace section (deep drill-down). */
  onlySection?: "tasks" | "projects" | "calendar" | "documents" | null;
  /** Embedded inside Odoo smart workspace — compact chrome. */
  embedded?: boolean;
  /** Collapse calendar events far in the future. */
  collapseFutureCalendar?: boolean;
  /** Premium Odoo workspace — compact chrome, operational-first. */
  workspaceMode?: boolean;
  workspaceFilter?: OdooWorkspaceFilter;
  initialFolders?: OdooFolderRow[];
  openFutureArchive?: boolean;
};

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
  const by = new Map(rows.map((r) => [Number(r.eventId), r]));
  return prev.map((ev) => {
    const r = by.get(Number(ev.id));
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

function taskAssigneeLabel(t: OdooTaskUiRow): string {
  if (t.assignees.length) return t.assignees.map((a) => a.name).join("، ");
  return t.responsible !== "—" ? t.responsible : "—";
}

function normalizeCachedTask(raw: unknown): OdooTaskUiRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<OdooTaskUiRow>;
  const id = Number(r.id);
  if (!Number.isFinite(id)) return null;
  const assignees = Array.isArray(r.assignees) ? r.assignees : [];
  const assigneeIds =
    Array.isArray(r.assigneeIds) && r.assigneeIds.length
      ? r.assigneeIds
      : assignees.map((a) => a.id);
  const descPlain =
    typeof r.descriptionPlain === "string"
      ? r.descriptionPlain
      : typeof r.description === "string"
        ? r.description.replace(/<[^>]+>/g, " ").trim()
        : "";
  return {
    id,
    name: String(r.name ?? ""),
    stage: String(r.stage ?? "—"),
    stageId: r.stageId ?? null,
    project: String(r.project ?? "—"),
    projectId: r.projectId ?? null,
    deadline: String(r.deadline ?? "—"),
    creator: String(r.creator ?? "—"),
    creatorId: r.creatorId ?? null,
    responsible: String(r.responsible ?? "—"),
    responsibleId: r.responsibleId ?? null,
    assigneeIds,
    assignees,
    tags: Array.isArray(r.tags) ? r.tags : [],
    tagIds: Array.isArray(r.tagIds) ? r.tagIds : [],
    description: String(r.description ?? ""),
    descriptionPlain: descPlain,
    priority: String(r.priority ?? "—"),
    active: Boolean(r.active ?? true),
  };
}

export function OdooTasksPanel({
  initialWorkspace = null,
  initialLastSyncAt = null,
  odooBaseUrl = null,
  onlySection = null,
  embedded = false,
  collapseFutureCalendar = false,
  workspaceMode = false,
  workspaceFilter = null,
  initialFolders,
  openFutureArchive = false,
}: OdooTasksPanelProps) {
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(new Set());
  const [bulkProgress, setBulkProgress] = useState<{ cur: number; total: number } | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(initialLastSyncAt);

  function runOp(key: string, work: () => Promise<void>) {
    setLoadingKeys((prev) => new Set(prev).add(key));
    void (async () => {
      try {
        await work();
      } finally {
        setLoadingKeys((prev) => {
          const n = new Set(prev);
          n.delete(key);
          return n;
        });
      }
    })();
  }
  const busy = (k: string) => loadingKeys.has(k);

  const [tasks, setTasks] = useState<OdooTaskUiRow[]>(() => {
    if (!Array.isArray(initialWorkspace?.tasks)) return [];
    return initialWorkspace.tasks
      .map((row) => normalizeCachedTask(row))
      .filter((row): row is OdooTaskUiRow => row != null);
  });
  const [taskStages, setTaskStages] = useState<OdooTaskStageOption[]>([]);
  const [odooUsers, setOdooUsers] = useState<OdooUserOption[]>([]);
  const [query, setQuery] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [taskIdForUpdate, setTaskIdForUpdate] = useState("");
  const [stageIdForUpdate, setStageIdForUpdate] = useState("");
  const [projects, setProjects] = useState<ProjectRow[]>(
    () => (Array.isArray(initialWorkspace?.projects) ? (initialWorkspace!.projects as ProjectRow[]) : []),
  );
  const [events, setEvents] = useState<CalendarRow[]>(
    () => (Array.isArray(initialWorkspace?.events) ? (initialWorkspace!.events as CalendarRow[]) : []),
  );
  const [documents, setDocuments] = useState<DocumentRow[]>(() => {
    if (!Array.isArray(initialWorkspace?.documents)) return [];
    return (initialWorkspace!.documents as Partial<DocumentRow>[]).map((d) => ({
      id: Number(d.id),
      name: String(d.name ?? ""),
      type: String(d.type ?? ""),
      mimetype: String(d.mimetype ?? ""),
      createdAt: String(d.createdAt ?? ""),
      creator: String(d.creator ?? "—"),
    }));
  });
  const workspaceDocumentsMeta = useMemo(() => {
    const m = initialWorkspace?.meta;
    if (!m || typeof m !== "object") return null;
    return m as { documentsMode?: OdooDocumentsExplorerMode; documentsWarning?: string | null };
  }, [initialWorkspace]);
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
  const [futureCalendarOpen, setFutureCalendarOpen] = useState(openFutureArchive);
  const [projectView, setProjectView] = useState<"list" | "cards">("cards");
  const [deepCopySource, setDeepCopySource] = useState<CalendarRow | null>(null);
  const [calendarRange, setCalendarRange] = useState<CalendarRange>("30d");
  const [docSort, setDocSort] = useState<"name" | "date">("date");
  const [showCreateBar, setShowCreateBar] = useState(false);

  const compactChrome = embedded || workspaceMode;

  const showSection = {
    tasks: !onlySection || onlySection === "tasks",
    projects: !onlySection || onlySection === "projects",
    calendar: !onlySection || onlySection === "calendar",
    documents: !onlySection || onlySection === "documents",
  };

  useEffect(() => {
    if (openFutureArchive) setFutureCalendarOpen(true);
  }, [openFutureArchive]);

  useEffect(() => {
    if (workspaceMode && showSection.calendar) {
      setCalendarRange("30d");
    }
  }, [workspaceMode, showSection.calendar]);

  const NEAR_TERM_MS = 90 * 86400000;

  const [sectionOpen, setSectionOpen] = useState({
    tasks: !onlySection || onlySection === "tasks",
    projects: !onlySection || onlySection === "projects",
    calendar: !onlySection || onlySection === "calendar",
    documents: !onlySection || onlySection === "documents",
  });

  const riskBadge = (risk: "none" | "watch" | "critical") => {
    if (risk === "critical") return <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium text-rose-800">حرج</span>;
    if (risk === "watch") return <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-900">مراقبة</span>;
    return <span className="text-muted-foreground text-[10px]">—</span>;
  };

  async function loadTaskMeta() {
    const [stagesRes, usersRes] = await Promise.all([
      listOdooTaskStagesAction(),
      listOdooUsersAction({ limit: 200 }),
    ]);
    if (stagesRes.ok) setTaskStages(stagesRes.stages);
    if (usersRes.ok) setOdooUsers(usersRes.users);
  }

  function loadTasks() {
    runOp("load-tasks", async () => {
      const [res] = await Promise.all([
        listOdooTasksAction({ text: query, limit: 50, mineOnly }),
        loadTaskMeta(),
      ]);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setTasks(res.tasks);
      setNeedsRefresh(false);
      setLastSyncAt(new Date().toISOString());
      toast.success(`تم جلب ${res.tasks.length} مهمة من Odoo.`);
    });
  }

  function loadAll() {
    runOp("load-all", async () => {
      const [res] = await Promise.all([
        listOdooWorkspaceAllAction({ text: query, mineOnly }),
        loadTaskMeta(),
      ]);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setTasks(res.tasks);
      setProjects(res.projects);
      setEvents(res.events);
      setDocuments(res.documents);
      setNeedsRefresh(false);
      setLastSyncAt(new Date().toISOString());
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
    runOp("create-task", async () => {
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
    runOp("update-stage", async () => {
      const res = await updateOdooTaskStageAction({ taskId, stageId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message);
      setNeedsRefresh(true);
    });
  }

  function editTaskRow(row: OdooTaskUiRow) {
    const nextName = prompt("اسم المهمة", row.name) ?? row.name;
    const nextDesc = prompt("الوصف", row.description ?? "") ?? row.description;
    const nextDeadline = prompt("تاريخ الاستحقاق YYYY-MM-DD", row.deadline === "—" ? "" : row.deadline) ?? "";
    runOp(`edit-task-${row.id}`, async () => {
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
    runOp(`archive-${model}-${id}`, async () => {
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
    runOp(`delete-${model}-${id}`, async () => {
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
    runOp("load-projects", async () => {
      const res = await listOdooProjectsAction({ text: query, limit: 100, mineOnly });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setProjects(res.projects);
      setNeedsRefresh(false);
      setLastSyncAt(new Date().toISOString());
      toast.success(`تم جلب ${res.projects.length} مشروع.`);
    });
  }

  function createProject() {
    if (!projectName.trim()) return toast.error("اسم المشروع مطلوب.");
    runOp("create-project", async () => {
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
    runOp("update-project-form", async () => {
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
    runOp("load-calendar", async () => {
      const res = await listOdooCalendarEventsAction({ text: query, limit: 100, mineOnly });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setEvents(res.events);
      setNeedsRefresh(false);
      setLastSyncAt(new Date().toISOString());
      toast.success(`تم جلب ${res.events.length} حدث تقويم.`);
    });
  }

  function createCalendarEvent() {
    if (!eventName.trim() || !eventStart.trim() || !eventStop.trim()) {
      return toast.error("اسم الحدث وتاريخ البداية والنهاية مطلوبة.");
    }
    runOp("create-calendar", async () => {
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
    runOp("update-calendar-form", async () => {
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
    runOp("load-documents", async () => {
      const res = await listOdooDocumentsAction({ text: query, limit: 100, mineOnly });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setDocuments(res.documents);
      setNeedsRefresh(false);
      setLastSyncAt(new Date().toISOString());
      toast.success(`تم جلب ${res.documents.length} مستند.`);
    });
  }

  function createDocument() {
    if (!docName.trim()) return toast.error("اسم المستند مطلوب.");
    runOp("create-document", async () => {
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
    runOp("update-document-form", async () => {
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
    runOp("export-excel", async () => {
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
    runOp("import-excel", async () => {
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
      for (const a of t.assignees) {
        const n = cleanName(a.name);
        if (n) bag.add(n);
      }
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

  const filteredTasks = useMemo(() => {
    const base = tasks.filter((t) =>
      passPeople(t.creator, t.responsible, ...t.assignees.map((a) => a.name))
    );
    if (!workspaceFilter || workspaceFilter === "projects_no_tasks" || workspaceFilter === "stalled_projects" || workspaceFilter === "future_archive" || workspaceFilter === "compliance") {
      return base;
    }
    return applyTaskWorkspaceFilter(base, workspaceFilter);
  }, [tasks, selectedPeople, workspaceFilter]);

  const filteredProjects = useMemo((): ProjectRow[] => {
    const base = projects.filter((p) => passPeople(p.creator, p.manager));
    const withIntel = base.map((p) => {
      const intel = buildProjectIntelMap(tasks, [{ id: p.id, manager: p.manager }]).get(p.id);
      return {
        ...p,
        taskCount: intel?.taskCount ?? p.taskCount ?? 0,
        openTaskCount: intel?.openTasks ?? p.openTaskCount ?? 0,
        overdueTaskCount: intel?.overdueTasks ?? p.overdueTaskCount ?? 0,
        hasNoTasks: intel?.hasNoTasks,
        isStalled: intel?.isStalled,
      };
    });
    if (!workspaceFilter) return withIntel;
    return applyProjectWorkspaceFilter(withIntel, workspaceFilter) as ProjectRow[];
  }, [projects, tasks, selectedPeople, workspaceFilter]);

  const projectIntelMap = useMemo(
    () =>
      buildProjectIntelMap(
        tasks,
        filteredProjects.map((p) => ({ id: p.id, manager: p.manager ?? "—" }))
      ),
    [tasks, filteredProjects]
  );
  const filteredEvents = events
    .filter((e) => passPeople(e.creator, e.responsible))
    .filter((e) => (compactChrome && showSection.calendar ? eventInCalendarRange(e.start, calendarRange) : true));
  const filteredDocuments = useMemo(() => {
    const base = documents.filter((d) => passPeople(d.creator));
    return [...base].sort((a, b) => {
      if (docSort === "name") return a.name.localeCompare(b.name, "ar");
      const da = Date.parse(a.createdAt.replace(" ", "T"));
      const db = Date.parse(b.createdAt.replace(" ", "T"));
      return (Number.isFinite(db) ? db : 0) - (Number.isFinite(da) ? da : 0);
    });
  }, [documents, docSort, selectedPeople]);

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
    runOp("cal-month", async () => {
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
    runOp("cal-day", async () => {
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
    runOp("clone-month", async () => {
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
            sourceEventStart: row.start,
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
      setBulkProgress({ cur: 0, total: payload.length });
      try {
        for (let i = 0; i < payload.length; i++) {
          const row = payload[i]!;
          setBulkProgress({ cur: i + 1, total: payload.length });
          const p1 = await cloneOdooCalendarEventPhaseOneAction({
            sourceEventId: row.eventId,
            name: row.name,
            start: row.start,
            stop: row.stop,
            allday: row.allday,
            description: row.description,
            location: row.location,
            partnerIds: row.partnerIds,
            responsibleId: row.responsibleId,
            skipRevalidate: true,
            attendeesPolicy: "copy_source",
          });
          if (!p1.ok) {
            errors.push(p1.error);
            totalFailed += 1;
            continue;
          }
          const p2 = await copyOdooMeetingAgendaInSlices({
            sourceEventId: row.eventId,
            targetEventId: p1.newEventId,
            targetEventStart: row.start,
            sourceEventStart: row.sourceEventStart,
            targetDescriptionForFallback: row.description,
            skipFinalRevalidate: true,
          });
          if (!p2.ok) {
            errors.push(p2.error);
            totalFailed += 1;
            continue;
          }
          totalCopied += 1;
          totalAgendaTable += p2.agendaTableItemsCreated;
          totalAgendaMail += p2.agendaActivitiesCreated;
          if (p2.fallbackDescriptionUpdated) totalFallback += 1;
        }
        await revalidateAiAgentOdooPanelAction();
      } finally {
        toast.dismiss(toastId);
        setBulkProgress(null);
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

  const tasksByStage = useMemo(() => {
    const m = new Map<string, OdooTaskUiRow[]>();
    for (const t of filteredTasks) {
      const k = t.stage || "—";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(t);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "ar"));
  }, [filteredTasks]);

  const projectsByState = useMemo(() => {
    const active: ProjectRow[] = [];
    const inactive: ProjectRow[] = [];
    for (const p of filteredProjects) {
      (p.active ? active : inactive).push(p);
    }
    return [
      { label: "نشطة", rows: active },
      { label: "مؤرشفة / غير نشطة", rows: inactive },
    ].filter((g) => g.rows.length);
  }, [filteredProjects]);

  const eventsByMonth = useMemo(() => {
    const m = new Map<string, CalendarRow[]>();
    for (const e of filteredEvents) {
      const k = (e.start || "").slice(0, 7) || "—";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredEvents]);

  const { nearTermEventsByMonth, futureEventsByYear } = useMemo(() => {
    if (!collapseFutureCalendar) {
      return { nearTermEventsByMonth: eventsByMonth, futureEventsByYear: [] as [string, CalendarRow[]][] };
    }
    const now = Date.now();
    const near = new Map<string, CalendarRow[]>();
    const future = new Map<string, CalendarRow[]>();
    for (const e of filteredEvents) {
      const startMs = Date.parse(String(e.start).replace(" ", "T"));
      const isFar =
        Number.isFinite(startMs) && startMs - now > NEAR_TERM_MS;
      const bucketKey = isFar
        ? String(e.start || "").slice(0, 4) || "—"
        : (e.start || "").slice(0, 7) || "—";
      const target = isFar ? future : near;
      if (!target.has(bucketKey)) target.set(bucketKey, []);
      target.get(bucketKey)!.push(e);
    }
    return {
      nearTermEventsByMonth: [...near.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      futureEventsByYear: [...future.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    };
  }, [collapseFutureCalendar, filteredEvents, eventsByMonth, NEAR_TERM_MS]);

  const calendarMonthGroups = collapseFutureCalendar ? nearTermEventsByMonth : eventsByMonth;

  const documentsByType = useMemo(() => {
    const m = new Map<string, DocumentRow[]>();
    for (const d of filteredDocuments) {
      const k = d.type || "—";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(d);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "ar"));
  }, [filteredDocuments]);

  const lastSyncStale =
    lastSyncAt != null && (Date.now() - new Date(lastSyncAt).getTime()) / 3600000 > 6;
  const lastSyncLabel = lastSyncAt
    ? new Date(lastSyncAt).toLocaleString("ar-SA", { dateStyle: "short", timeStyle: "short" })
    : "لم تُجرَ مزامنة بعد";

  const calBusy = busy("cal-month") || busy("cal-day") || busy("clone-month") || agendaHydrate !== "idle";

  const workspaceHasNonTaskLists =
    projects.length > 0 || events.length > 0 || documents.length > 0;
  const tasksTableEmptyMessage = !filteredTasks.length
    ? tasks.length > 0
      ? "لا توجد مهام تطابق تصفية الأشخاص المختارين."
      : workspaceHasNonTaskLists
        ? "لا توجد مهام في البيانات المحمّلة؛ استخدم «جلب المهام» أو راجع المشاريع والأقسام الأخرى."
        : "لا توجد نتائج حتى الآن."
    : "";

  return (
    <Card
      className={cn(
        "w-full max-w-none",
        embedded
          ? "border-border/60 shadow-sm"
          : "border-primary/20 shadow-[var(--shadow-premium)] ring-1 ring-primary/15"
      )}
    >
      <CardHeader className={compactChrome ? "pb-2 pt-4" : undefined}>
        {!compactChrome ? (
          <>
            <CardTitle>لوحة مهام Odoo (Browser Session)</CardTitle>
            <CardDescription>
              قراءة/بحث/تحديث/إنشاء مهام Odoo بدون Database Name.
            </CardDescription>
          </>
        ) : (
          <CardTitle className="text-base">
            {onlySection === "projects"
              ? "المشاريع"
              : onlySection === "calendar"
                ? "التقويم"
                : onlySection === "documents"
                  ? "المستندات"
                  : "المهام"}
          </CardTitle>
        )}
        {!workspaceMode ? (
        <p
          className={`text-xs font-medium ${lastSyncStale ? "text-amber-800/90 dark:text-amber-300/90" : "text-muted-foreground"}`}
        >
          آخر مزامنة محفوظة: {lastSyncLabel}
        </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {(bulkProgress || busy("clone-month") || busy("cal-month") || busy("cal-day")) && (
          <div className="space-y-1">
            <div className="bg-muted relative h-1.5 w-full overflow-hidden rounded-full">
              {bulkProgress ? (
                <div
                  className="bg-primary absolute inset-y-0 start-0 transition-[width]"
                  style={{ width: `${Math.round((100 * bulkProgress.cur) / Math.max(1, bulkProgress.total))}%` }}
                />
              ) : (
                <div className="bg-primary/70 absolute inset-y-0 start-0 w-1/3 animate-pulse" />
              )}
            </div>
            {bulkProgress ? (
              <p className="text-muted-foreground text-[11px]">
                {bulkProgress.cur} / {bulkProgress.total}
              </p>
            ) : (
              <p className="text-muted-foreground text-[11px]">جاري تنفيذ طلب…</p>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="بحث بالعنوان..."
            className="max-w-sm"
          />
          {compactChrome ? (
            <>
              <Button type="button" onClick={loadAll} disabled={busy("load-all")}>
                {busy("load-all") ? <Loader2Icon className="size-4 animate-spin" /> : null}
                تحديث
              </Button>
              <Button type="button" variant={mineOnly ? "default" : "outline"} onClick={() => setMineOnly((v) => !v)}>
                {mineOnly ? "ما يخصني" : "الكل"}
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={exportExcel} disabled={busy("export-excel")}>
                Excel
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowCreateBar((v) => !v)}>
                {showCreateBar ? "إخفاء الإنشاء" : "إنشاء"}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" onClick={loadTasks} disabled={busy("load-tasks")}>
                {busy("load-tasks") ? <Loader2Icon className="size-4 animate-spin" /> : null}
                جلب المهام
              </Button>
              <Button type="button" onClick={loadAll} disabled={busy("load-all")}>
                {busy("load-all") ? <Loader2Icon className="size-4 animate-spin" /> : null}
                جلب الكل
              </Button>
              <Button type="button" variant="outline" onClick={loadProjects} disabled={busy("load-projects")}>
                {busy("load-projects") ? <Loader2Icon className="size-4 animate-spin" /> : null}
                المشاريع
              </Button>
              <Button type="button" variant="outline" onClick={loadCalendar} disabled={busy("load-calendar")}>
                {busy("load-calendar") ? <Loader2Icon className="size-4 animate-spin" /> : null}
                التقويم
              </Button>
              <Button type="button" variant="outline" onClick={loadDocuments} disabled={busy("load-documents")}>
                {busy("load-documents") ? <Loader2Icon className="size-4 animate-spin" /> : null}
                المستندات
              </Button>
              <Button type="button" variant="secondary" onClick={exportExcel} disabled={busy("export-excel")}>
                {busy("export-excel") ? <Loader2Icon className="size-4 animate-spin" /> : null}
                تصدير Excel
              </Button>
              <Button
                type="button"
                variant={needsRefresh ? "default" : "outline"}
                onClick={loadAll}
                disabled={busy("load-all")}
              >
                تحديث الآن
              </Button>
              <Button type="button" variant={mineOnly ? "default" : "outline"} onClick={() => setMineOnly((v) => !v)}>
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
                  {busy("import-excel") ? <Loader2Icon className="me-1 size-4 animate-spin" /> : null}
                  استيراد Excel
                </span>
              </label>
            </>
          )}
        </div>
        {needsRefresh && !compactChrome ? (
          <p className="text-xs text-amber-600">
            توجد تغييرات جديدة. اضغط &quot;تحديث الآن&quot; عند الانتهاء من جميع الإجراءات.
          </p>
        ) : null}

        {compactChrome && showCreateBar ? (
          <div className="rounded-md border bg-muted/20 p-3">
            {(!onlySection || onlySection === "tasks") && (
              <div className="flex flex-wrap gap-2">
                <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="مهمة جديدة" className="max-w-xs" />
                <Button type="button" size="sm" onClick={createTask} disabled={busy("create-task")}>إنشاء مهمة</Button>
              </div>
            )}
            {onlySection === "projects" && (
              <div className="flex flex-wrap gap-2">
                <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="مشروع جديد" className="max-w-xs" />
                <Button type="button" size="sm" onClick={createProject} disabled={busy("create-project")}>إنشاء مشروع</Button>
              </div>
            )}
            {onlySection === "calendar" && (
              <div className="flex flex-wrap gap-2">
                <Input value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="حدث" className="max-w-xs" />
                <Input value={eventStart} onChange={(e) => setEventStart(e.target.value)} placeholder="البداية" className="max-w-[11rem]" />
                <Button type="button" size="sm" onClick={createCalendarEvent} disabled={busy("create-calendar")}>إنشاء حدث</Button>
              </div>
            )}
            {onlySection === "documents" && (
              <div className="flex flex-wrap gap-2">
                <Input value={docName} onChange={(e) => setDocName(e.target.value)} placeholder="مستند جديد" className="max-w-xs" />
                <Button type="button" size="sm" onClick={createDocument} disabled={busy("create-document")}>إنشاء مستند</Button>
              </div>
            )}
          </div>
        ) : null}

        {!compactChrome ? (
        <>
        <div className="rounded-md border p-3">
          <Label className="mb-2 block">تصفية العرض بالأشخاص (من البيانات الحالية)</Label>
          <div className="mb-2 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setSelectedPeople(peoplePool)} disabled={!peoplePool.length}>
              اختيار الكل
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setSelectedPeople([])}>
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
          <Button type="button" variant="outline" onClick={createTask} disabled={busy("create-task")}>
            {busy("create-task") ? <Loader2Icon className="me-1 inline size-4 animate-spin" /> : null}
            إنشاء في Odoo
          </Button>
        </div>

        <div className="grid gap-2 rounded-md border p-3">
          <Label>إدارة المشاريع</Label>
          <div className="flex flex-wrap gap-2">
            <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="اسم مشروع جديد" className="max-w-sm" />
            <Button type="button" variant="outline" onClick={createProject} disabled={busy("create-project")}>إنشاء مشروع</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input value={projectIdForUpdate} onChange={(e) => setProjectIdForUpdate(e.target.value)} placeholder="Project ID" className="w-32" />
            <Input value={projectNameForUpdate} onChange={(e) => setProjectNameForUpdate(e.target.value)} placeholder="الاسم الجديد" className="max-w-sm" />
            <Button type="button" variant="outline" onClick={updateProject} disabled={busy("update-project-form")}>تحديث مشروع</Button>
          </div>
        </div>

        <div className="grid gap-2 rounded-md border p-3">
          <Label>إدارة التقويم</Label>
          <div className="flex flex-wrap gap-2">
            <Input value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="اسم الحدث" className="max-w-sm" />
            <Input value={eventStart} onChange={(e) => setEventStart(e.target.value)} placeholder="Start (YYYY-MM-DD HH:mm:ss)" className="max-w-sm" />
            <Input value={eventStop} onChange={(e) => setEventStop(e.target.value)} placeholder="Stop (YYYY-MM-DD HH:mm:ss)" className="max-w-sm" />
            <Button type="button" variant="outline" onClick={createCalendarEvent} disabled={busy("create-calendar")}>إنشاء حدث</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input value={eventIdForUpdate} onChange={(e) => setEventIdForUpdate(e.target.value)} placeholder="Event ID" className="w-32" />
            <Input value={eventNameForUpdate} onChange={(e) => setEventNameForUpdate(e.target.value)} placeholder="اسم جديد للحدث" className="max-w-sm" />
            <Button type="button" variant="outline" onClick={updateCalendarEvent} disabled={busy("update-calendar-form")}>تحديث حدث</Button>
          </div>
        </div>

        <div className="grid gap-2 rounded-md border p-3">
          <Label>إدارة المستندات</Label>
          <div className="flex flex-wrap gap-2">
            <Input value={docName} onChange={(e) => setDocName(e.target.value)} placeholder="اسم مستند جديد" className="max-w-sm" />
            <Button type="button" variant="outline" onClick={createDocument} disabled={busy("create-document")}>إنشاء مستند</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input value={docIdForUpdate} onChange={(e) => setDocIdForUpdate(e.target.value)} placeholder="Document ID" className="w-32" />
            <Input value={docNameForUpdate} onChange={(e) => setDocNameForUpdate(e.target.value)} placeholder="الاسم الجديد" className="max-w-sm" />
            <Button type="button" variant="outline" onClick={updateDocument} disabled={busy("update-document-form")}>تحديث مستند</Button>
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
            <Button type="button" variant="outline" onClick={updateStage} disabled={busy("update-stage")}>
              {busy("update-stage") ? <Loader2Icon className="me-1 inline size-4 animate-spin" /> : null}
              تحديث المرحلة
            </Button>
          </div>
        </div>
        </>
        ) : null}

        {showSection.tasks ? (
        <div className="overflow-x-auto">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <Label className="text-base font-medium">المهام ({filteredTasks.length})</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={() => setSectionOpen((s) => ({ ...s, tasks: !s.tasks }))}
              aria-expanded={sectionOpen.tasks}
            >
              <ChevronDown className={cn("size-4 transition-transform", !sectionOpen.tasks && "-rotate-90")} />
              {sectionOpen.tasks ? "تقليص" : "توسيع"}
            </Button>
          </div>
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 text-start">ID</th>
                <th className="py-2 text-start">المهمة</th>
                <th className="py-2 text-start">المرحلة</th>
                <th className="py-2 text-start">المشروع</th>
                <th className="py-2 text-start">الاستحقاق</th>
                <th className="py-2 text-start">المنشئ</th>
                <th className="py-2 text-start">المكلفون</th>
                <th className="py-2 text-start">إجراءات</th>
              </tr>
            </thead>
            <tbody
              className={cn(!sectionOpen.tasks && "hidden")}
              aria-hidden={!sectionOpen.tasks}
            >
              {!filteredTasks.length ? (
                <tr>
                  <td colSpan={8} className="py-3 text-center text-muted-foreground">
                    {tasksTableEmptyMessage}
                  </td>
                </tr>
              ) : (
                tasksByStage.flatMap(([stage, rows]) => [
                  <tr key={`stage-h-${stage}`} className="border-b bg-muted/40">
                    <td colSpan={8} className="py-2 ps-2 text-xs font-semibold text-primary">
                      المرحلة: {stage} ({rows.length})
                    </td>
                  </tr>,
                  ...rows.map((t) => (
                    <Fragment key={`task-${t.id}`}>
                      <tr className="border-b">
                        <td className="py-2">{t.id}</td>
                        <td className="py-2">{t.name}</td>
                        <td className="py-2">{t.stage}</td>
                        <td className="py-2">{t.project}</td>
                        <td className="py-2">{t.deadline}</td>
                        <td className="py-2">{t.creator}</td>
                        <td className="max-w-[14rem] py-2 text-xs leading-snug">{taskAssigneeLabel(t)}</td>
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
                            <OdooTaskExpandedDetail
                              task={t}
                              stages={taskStages}
                              users={odooUsers}
                              odooBaseUrl={odooBaseUrl}
                              busy={busy(`stage-${t.id}`) || busy(`assignees-${t.id}`)}
                              onBusy={runOp}
                              onChanged={() => {
                                setNeedsRefresh(true);
                                loadTasks();
                              }}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )),
                ])
              )}
            </tbody>
          </table>
        </div>
        ) : null}

        {showSection.projects || showSection.calendar || showSection.documents ? (
        <div className="space-y-6">
          {showSection.projects ? (
          <div className="w-full">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <Label className="text-base font-medium">المشاريع ({filteredProjects.length})</Label>
              <div className="flex flex-wrap items-center gap-1">
                {workspaceMode ? (
                  <>
                    <Button type="button" size="sm" variant={projectView === "cards" ? "default" : "outline"} className="h-7 text-xs" onClick={() => setProjectView("cards")}>
                      بطاقات
                    </Button>
                    <Button type="button" size="sm" variant={projectView === "list" ? "default" : "outline"} className="h-7 text-xs" onClick={() => setProjectView("list")}>
                      قائمة
                    </Button>
                  </>
                ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1 text-xs"
                onClick={() => setSectionOpen((s) => ({ ...s, projects: !s.projects }))}
                aria-expanded={sectionOpen.projects}
              >
                <ChevronDown className={cn("size-4 transition-transform", !sectionOpen.projects && "-rotate-90")} />
                {sectionOpen.projects ? "تقليص" : "توسيع"}
              </Button>
              </div>
            </div>
            {workspaceMode && projectView === "cards" ? (
              <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3", !sectionOpen.projects && "hidden")}>
                {!filteredProjects.length ? (
                  <p className="text-muted-foreground col-span-full py-6 text-center text-sm">لا توجد بيانات.</p>
                ) : (
                  filteredProjects.map((p) => {
                    const intel = projectIntelMap.get(p.id);
                    return (
                      <div key={p.id} className="rounded-xl border border-border/60 bg-card p-3 shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium leading-snug">{p.name}</p>
                          {intel ? riskBadge(intel.risk) : null}
                        </div>
                        <p className="text-muted-foreground mt-1 text-xs">{p.manager || "—"} · {p.partner || "—"}</p>
                        <div className="mt-2 flex flex-wrap gap-2 text-[10px] tabular-nums">
                          <span className="rounded bg-muted px-1.5 py-0.5">{intel?.taskCount ?? p.taskCount ?? 0} مهام</span>
                          <span className="rounded bg-muted px-1.5 py-0.5">{intel?.overdueTasks ?? p.overdueTaskCount ?? 0} متأخر</span>
                          {(p.linkedEventCount ?? 0) > 0 ? (
                            <span className="rounded bg-muted px-1.5 py-0.5">{p.linkedEventCount} أحداث</span>
                          ) : null}
                        </div>
                        {p.descriptionPlain ? (
                          <p className="text-muted-foreground mt-2 line-clamp-2 text-[11px]">{p.descriptionPlain}</p>
                        ) : null}
                        <Button type="button" size="sm" variant="outline" className="mt-2 h-7 text-xs" onClick={() => setExpandedProjectId((id) => (id === p.id ? null : p.id))}>
                          {expandedProjectId === p.id ? "إخفاء" : "تفاصيل"}
                        </Button>
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-start text-muted-foreground">
                    <th className="py-2 pe-3 font-medium">ID</th>
                    <th className="py-2 pe-3 font-medium">الاسم</th>
                    <th className="py-2 pe-3 font-medium">المسؤول</th>
                    {workspaceMode ? (
                      <>
                        <th className="py-2 pe-3 font-medium">مهام</th>
                        <th className="py-2 pe-3 font-medium">متأخر</th>
                        <th className="py-2 pe-3 font-medium">مؤشر</th>
                      </>
                    ) : null}
                    <th className="py-2 pe-3 font-medium">الحالة</th>
                    <th className="py-2 pe-3 font-medium">الرؤية</th>
                    <th className="py-2 pe-3 font-medium">المنشئ</th>
                    <th className="py-2 font-medium">إجراءات</th>
                  </tr>
                </thead>
                <tbody
                  className={cn(!sectionOpen.projects && "hidden")}
                  aria-hidden={!sectionOpen.projects}
                >
                  {!filteredProjects.length ? (
                    <tr>
                      <td colSpan={7} className="text-muted-foreground py-6 text-center">
                        لا توجد بيانات.
                      </td>
                    </tr>
                  ) : (
                    projectsByState.flatMap(({ label, rows }) => [
                      <tr key={`pg-${label}`} className="border-b bg-muted/40">
                        <td colSpan={7} className="py-2 ps-2 text-xs font-semibold text-primary">
                          {label} ({rows.length})
                        </td>
                      </tr>,
                      ...rows.map((p) => {
                        const intel = projectIntelMap.get(p.id);
                        const noOwner = !cleanName(p.manager);
                        return (
                        <Fragment key={`proj-${p.id}`}>
                          <tr className="border-b align-top">
                            <td className="py-2 pe-3">{p.id}</td>
                            <td className="py-2 pe-3 font-medium">
                              {p.name}
                              {noOwner ? (
                                <span className="text-amber-700 ms-1 text-[10px]">· بلا مسؤول</span>
                              ) : null}
                              {intel?.hasNoTasks ? (
                                <span className="text-muted-foreground ms-1 text-[10px]">· بلا مهام</span>
                              ) : null}
                            </td>
                            <td className="py-2 pe-3">{p.manager}</td>
                            {workspaceMode ? (
                              <>
                                <td className="py-2 pe-3 tabular-nums">{intel?.taskCount ?? 0}</td>
                                <td className="py-2 pe-3 tabular-nums text-rose-700">{intel?.overdueTasks ?? 0}</td>
                                <td className="py-2 pe-3">{riskBadge(intel?.risk ?? "none")}</td>
                              </>
                            ) : null}
                            <td className="py-2 pe-3">{p.active ? "نشط" : "مؤرشف"}</td>
                            <td className="py-2 pe-3 text-xs">{p.visibility || "—"}</td>
                            <td className="py-2 pe-3">{p.creator}</td>
                            <td className="py-2">
                              <div className="flex flex-wrap gap-1">
                                <Button type="button" size="sm" variant="outline" onClick={() => setExpandedProjectId((id) => (id === p.id ? null : p.id))}>
                                  {expandedProjectId === p.id ? "إخفاء" : "استعراض"}
                                </Button>
                                <Button type="button" size="sm" variant="outline" onClick={() => {
                                  const next = prompt("اسم المشروع الجديد", p.name) ?? p.name;
                                  runOp(`inline-project-${p.id}`, async () => {
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
                            </td>
                          </tr>
                          {expandedProjectId === p.id ? (
                            <tr className="border-b bg-muted/20">
                              <td colSpan={workspaceMode ? 10 : 7} className="space-y-2 p-3 text-xs">
                                <p><span className="font-medium">الحالة:</span> {p.active ? "نشط" : "مؤرشف"}</p>
                                <p><span className="font-medium">الرؤية:</span> {p.visibility || "—"}</p>
                                <p><span className="font-medium">تاريخ الإنشاء:</span> {p.createdAt || "—"}</p>
                                {intel ? (
                                  <p>
                                    <span className="font-medium">ملخص المهام:</span>{" "}
                                    {intel.openTasks} مفتوحة · {intel.overdueTasks} متأخرة · {intel.highPriorityTasks} أولوية عالية
                                  </p>
                                ) : null}
                                <div>
                                  <p className="mb-1 font-medium">مهام المشروع</p>
                                  <ul className="max-h-40 space-y-1 overflow-y-auto">
                                    {tasks.filter((t) => t.projectId === p.id && t.active).slice(0, 12).map((t) => (
                                      <li key={t.id} className="rounded border border-border/50 bg-background/80 px-2 py-1">
                                        {t.name} — {t.stage} — {t.deadline}
                                      </li>
                                    ))}
                                    {!tasks.some((t) => t.projectId === p.id) ? (
                                      <li className="text-muted-foreground">لا مهام مرتبطة في اللقطة الحالية.</li>
                                    ) : null}
                                  </ul>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                        );
                      }),
                    ])
                  )}
                </tbody>
              </table>
            </div>
            )}
          </div>
          ) : null}

          {showSection.calendar ? (
          <div className="w-full">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <Label className="text-base font-medium">التقويم ({filteredEvents.length})</Label>
              <div className="flex flex-wrap items-center gap-1">
                {workspaceMode
                  ? (["today", "week", "30d", "all"] as CalendarRange[]).map((r) => (
                      <Button
                        key={r}
                        type="button"
                        size="sm"
                        variant={calendarRange === r ? "default" : "outline"}
                        className="h-7 text-xs"
                        onClick={() => setCalendarRange(r)}
                      >
                        {r === "today" ? "اليوم" : r === "week" ? "الأسبوع" : r === "30d" ? "30 يوم" : "الكل"}
                      </Button>
                    ))
                  : null}
                <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1 text-xs"
                onClick={() => setSectionOpen((s) => ({ ...s, calendar: !s.calendar }))}
                aria-expanded={sectionOpen.calendar}
              >
                <ChevronDown className={cn("size-4 transition-transform", !sectionOpen.calendar && "-rotate-90")} />
                {sectionOpen.calendar ? "تقليص" : "توسيع"}
              </Button>
              </div>
            </div>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[960px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-start text-muted-foreground">
                    <th className="py-2 pe-3 font-medium">ID</th>
                    <th className="py-2 pe-3 font-medium">الاسم</th>
                    <th className="py-2 pe-3 font-medium">المسؤول</th>
                    <th className="py-2 pe-3 font-medium">الفترة</th>
                    <th className="py-2 pe-3 font-medium">الحالة</th>
                    <th className="py-2 font-medium">إجراءات</th>
                  </tr>
                </thead>
                <tbody
                  className={cn(!sectionOpen.calendar && "hidden")}
                  aria-hidden={!sectionOpen.calendar}
                >
                  {!filteredEvents.length ? (
                    <tr>
                      <td colSpan={6} className="text-muted-foreground py-6 text-center">
                        لا توجد بيانات.
                      </td>
                    </tr>
                  ) : (
                    <>
                      {calendarMonthGroups.flatMap(([ym, rows]) => [
                        <tr key={`eg-${ym}`} className="border-b bg-muted/40">
                          <td colSpan={6} className="py-2 ps-2 text-xs font-semibold text-primary">
                            الشهر: {ym} ({rows.length})
                          </td>
                        </tr>,
                        ...rows.map((e) => (
                          <Fragment key={`evt-${e.id}`}>
                            <tr className="border-b align-top">
                              <td className="py-2 pe-3">{e.id}</td>
                              <td className="py-2 pe-3 font-medium">{e.name}</td>
                              <td className="py-2 pe-3">{e.responsible}</td>
                              <td className="py-2 pe-3 text-xs [direction:ltr]">{e.start} → {e.stop}</td>
                              <td className="py-2 pe-3">{e.active ? "نشط" : "مؤرشف"}</td>
                              <td className="py-2">
                                <div className="flex flex-wrap gap-1">
                                  <Button type="button" size="sm" variant="outline" onClick={() => setExpandedEventId((id) => (id === e.id ? null : e.id))}>
                                    {expandedEventId === e.id ? "إخفاء" : "استعراض"}
                                  </Button>
                                  <Button type="button" size="sm" variant="outline" onClick={() => {
                                    const next = prompt("اسم الحدث الجديد", e.name) ?? e.name;
                                    runOp(`inline-event-${e.id}`, async () => {
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
                              </td>
                            </tr>
                            {expandedEventId === e.id ? (
                              <tr className="border-b bg-muted/20">
                                <td colSpan={6} className="space-y-2 p-3 text-xs">
                                  {e.resModel ? (
                                    <p>
                                      <span className="font-medium">مرتبط بسجل Odoo:</span> {e.resModel}
                                      {e.resId != null ? ` #${e.resId}` : ""}
                                    </p>
                                  ) : null}
                                  <p><span className="font-medium">الموقع:</span> {e.location || "—"}</p>
                                  <p className="whitespace-pre-wrap"><span className="font-medium">الوصف:</span> {e.description || "لا توجد ملاحظات."}</p>
                                  {e.agendaItems?.length ? (
                                    <div>
                                      <p className="font-medium">جدول الأجندة:</p>
                                      <ul className="list-disc ps-4">
                                        {e.agendaItems.map((it) => (
                                          <li key={it.id}>{it.name || "—"}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  ) : null}
                                  {e.agendaLines?.length ? (
                                    <div>
                                      <p className="font-medium">أنشطة بريد:</p>
                                      <ul className="list-disc ps-4">
                                        {e.agendaLines.map((a) => (
                                          <li key={a.id}>{a.summary || "—"}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  ) : null}
                                  <p><span className="font-medium">اقتراح:</span></p>
                                  <ul className="list-disc ps-4">
                                    {suggestEventAutomation(e).map((tip) => (
                                      <li key={tip}>{tip}</li>
                                    ))}
                                  </ul>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        )),
                      ])}
                      {collapseFutureCalendar && futureEventsByYear.length ? (
                        <>
                          <tr className="border-b bg-amber-500/10">
                            <td colSpan={6} className="py-2 ps-2">
                              <button
                                type="button"
                                className="flex w-full items-center justify-between gap-2 text-start text-xs font-semibold text-amber-900"
                                onClick={() => setFutureCalendarOpen((o) => !o)}
                              >
                                <span>أحداث مجدولة في المستقبل (بعد 90 يوماً) — {futureEventsByYear.reduce((n, [, r]) => n + r.length, 0)} حدث</span>
                                <ChevronDown className={cn("size-4 shrink-0 transition-transform", !futureCalendarOpen && "-rotate-90")} />
                              </button>
                              <p className="text-muted-foreground mt-0.5 text-[10px] font-normal">وسّع فقط عند الحاجة — لا تُعرض ضمن الأحداث القريبة.</p>
                            </td>
                          </tr>
                          {futureCalendarOpen
                            ? futureEventsByYear.flatMap(([year, rows]) => [
                                <tr key={`feg-${year}`} className="border-b bg-muted/30">
                                  <td colSpan={6} className="py-1.5 ps-3 text-[11px] font-medium text-muted-foreground">
                                    سنة {year} ({rows.length})
                                  </td>
                                </tr>,
                                ...rows.map((e) => (
                                  <tr key={`fevt-${e.id}`} className="border-b align-top text-muted-foreground">
                                    <td className="py-2 pe-3">{e.id}</td>
                                    <td className="py-2 pe-3">{e.name}</td>
                                    <td className="py-2 pe-3">{e.responsible}</td>
                                    <td className="py-2 pe-3 text-xs [direction:ltr]">{e.start} → {e.stop}</td>
                                    <td className="py-2 pe-3">{e.active ? "نشط" : "مؤرشف"}</td>
                                    <td className="py-2">
                                      <Button type="button" size="sm" variant="outline" onClick={() => setExpandedEventId((id) => (id === e.id ? null : e.id))}>
                                        {expandedEventId === e.id ? "إخفاء" : "استعراض"}
                                      </Button>
                                    </td>
                                  </tr>
                                )),
                              ])
                            : null}
                        </>
                      ) : null}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          ) : null}

          {showSection.documents ? (
          workspaceMode ? (
            <OdooDocumentsExplorer
              initialFolders={initialFolders}
              locale="ar"
              complianceFilter={workspaceFilter === "compliance"}
              odooBaseUrl={odooBaseUrl}
              initialMode={workspaceDocumentsMeta?.documentsMode}
              initialWarning={workspaceDocumentsMeta?.documentsWarning ?? undefined}
            />
          ) : (
          <div className="w-full">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <Label className="text-base font-medium">المستندات ({filteredDocuments.length})</Label>
              <div className="flex flex-wrap items-center gap-1">
                {workspaceMode ? (
                  <>
                    <Button type="button" size="sm" variant={docSort === "date" ? "default" : "outline"} className="h-7 text-xs" onClick={() => setDocSort("date")}>
                      الأحدث
                    </Button>
                    <Button type="button" size="sm" variant={docSort === "name" ? "default" : "outline"} className="h-7 text-xs" onClick={() => setDocSort("name")}>
                      الاسم
                    </Button>
                  </>
                ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1 text-xs"
                onClick={() => setSectionOpen((s) => ({ ...s, documents: !s.documents }))}
                aria-expanded={sectionOpen.documents}
              >
                <ChevronDown className={cn("size-4 transition-transform", !sectionOpen.documents && "-rotate-90")} />
                {sectionOpen.documents ? "تقليص" : "توسيع"}
              </Button>
              </div>
            </div>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[800px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-start text-muted-foreground">
                    <th className="py-2 pe-3 font-medium">ID</th>
                    <th className="py-2 pe-3 font-medium">الاسم</th>
                    <th className="py-2 pe-3 font-medium">النوع</th>
                    <th className="py-2 pe-3 font-medium">MIME</th>
                    <th className="py-2 pe-3 font-medium">المنشئ</th>
                    <th className="py-2 pe-3 font-medium">تاريخ الإنشاء</th>
                    <th className="py-2 font-medium">إجراءات</th>
                  </tr>
                </thead>
                <tbody
                  className={cn(!sectionOpen.documents && "hidden")}
                  aria-hidden={!sectionOpen.documents}
                >
                  {!filteredDocuments.length ? (
                    <tr>
                      <td colSpan={6} className="text-muted-foreground py-6 text-center">
                        لا توجد بيانات.
                      </td>
                    </tr>
                  ) : (
                    documentsByType.flatMap(([typeKey, rows]) => [
                      <tr key={`dg-${typeKey}`} className="border-b bg-muted/40">
                        <td colSpan={7} className="py-2 ps-2 text-xs font-semibold text-primary">
                          النوع: {typeKey} ({rows.length})
                        </td>
                      </tr>,
                      ...rows.map((d) => (
                        <Fragment key={`doc-${d.id}`}>
                          <tr className="border-b align-top">
                            <td className="py-2 pe-3">{d.id}</td>
                            <td className="py-2 pe-3 font-medium">{d.name}</td>
                            <td className="py-2 pe-3">{d.type || "—"}</td>
                            <td className="py-2 pe-3 text-[11px] [direction:ltr]">{d.mimetype || "—"}</td>
                            <td className="py-2 pe-3">{d.creator}</td>
                            <td className="py-2 pe-3 text-xs [direction:ltr]">{d.createdAt || "—"}</td>
                            <td className="py-2">
                              <div className="flex flex-wrap gap-1">
                                <Button type="button" size="sm" variant="outline" onClick={() => setExpandedDocId((id) => (id === d.id ? null : d.id))}>
                                  {expandedDocId === d.id ? "إخفاء" : "استعراض"}
                                </Button>
                                <Button type="button" size="sm" variant="outline" onClick={() => {
                                  const next = prompt("اسم المستند الجديد", d.name) ?? d.name;
                                  runOp(`inline-doc-${d.id}`, async () => {
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
                            </td>
                          </tr>
                          {expandedDocId === d.id ? (
                            <tr className="border-b bg-muted/20">
                              <td colSpan={7} className="p-3 text-xs">
                                <p><span className="font-medium">نوع المستند:</span> {d.type || "—"}</p>
                                <p><span className="font-medium">MIME:</span> {d.mimetype || "—"}</p>
                                <p><span className="font-medium">المنشئ:</span> {d.creator}</p>
                                <p><span className="font-medium">تاريخ الإنشاء:</span> {d.createdAt || "—"}</p>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      )),
                    ])
                  )}
                </tbody>
              </table>
            </div>
          </div>
          )
          ) : null}
        </div>
        ) : null}

        {showSection.calendar ? (
        <>
        <div className="premium-calendar-panel">
          <Label className="block font-semibold text-primary">مطابقة تفاصيل أي يوم (وليس شهرًا فقط)</Label>
          <p className="text-xs text-muted-foreground">
            اختر أي تاريخ، وسنجلب أحداثه من Odoo (الوصف والموقع والمسؤولين)، ثم نحمّل بنود الأجندة وجدول Odoo على دفعات صغيرة لتجنّب انتهاء مهلة الخادم.
          </p>
          <div className="flex flex-wrap gap-2">
            <Input type="date" value={dayToCompare} onChange={(e) => setDayToCompare(e.target.value)} className="w-44" />
            <Button
              type="button"
              variant="outline"
              onClick={loadSelectedDayEvents}
              disabled={calBusy}
            >
              مطابقة اليوم المحدد
            </Button>
          </div>
          <div className="premium-calendar-scroll">
            {dayEvents.length ? (
              dayEvents.map((e) => (
                <div key={`day-${e.id}`} className="premium-calendar-row">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-medium">#{e.id} - {e.name}</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="shrink-0"
                      disabled={calBusy}
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

        <div className="premium-calendar-panel">
          <Label className="block font-semibold text-primary">نسخ مهام/أحداث الشهر السابق للشهر الجديد</Label>
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
              disabled={calBusy}
            >
              جلب كل أيام شهر المصدر
            </Button>
            <Button type="button" variant="outline" onClick={() => setSelectedCalendarIds(sourceMonthEvents.map((e) => e.id))}>
              اختيار كل أحداث شهر المصدر
            </Button>
            <Button type="button" variant="outline" onClick={() => setSelectedCalendarIds([])}>
              إلغاء الاختيار
            </Button>
            <Button type="button" onClick={cloneSelectedMonthEvents} disabled={calBusy}>
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
          <div className="premium-calendar-scroll">
            {sourceMonthEvents.length ? (
              sourceMonthEvents.map((e) => (
                <div
                  key={e.id}
                  className="premium-calendar-row flex flex-wrap items-start gap-2"
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
                    disabled={calBusy}
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
        </>
        ) : null}
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
                partners: deepCopySource.partners,
              }
            : null
        }
        onCompleted={() => {
          setNeedsRefresh(true);
          setDeepCopySource(null);
          loadSourceMonthEvents();
        }}
      />
    </Card>
  );
}

