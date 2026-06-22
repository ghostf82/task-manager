import type { OdooTaskUiRow } from "@/lib/integrations/odoo-task-ui-types";
import type { OdooRelationshipConfidence } from "@/lib/command-center/odoo-relationship-types";

export type OdooProjectEnrichedRow = {
  id: number;
  name: string;
  active: boolean;
  creator: string;
  creatorId: number | null;
  manager: string;
  managerId: number | null;
  visibility: string;
  createdAt: string;
  partner: string;
  partnerId: number | null;
  description: string;
  descriptionPlain: string;
  dateStart: string;
  dateEnd: string;
  tags: string[];
  tagIds: number[];
  taskCount: number;
  openTaskCount: number;
  overdueTaskCount: number;
  highPriorityTaskCount: number;
  unassignedTaskCount: number;
  linkedEventCount: number | null;
  linkedEventConfidence: OdooRelationshipConfidence;
  linkedDocumentCount: number | null;
  linkedDocumentConfidence: OdooRelationshipConfidence;
};

function parseDeadlineMs(deadline: string): number | null {
  const raw = String(deadline || "").trim();
  if (!raw || raw === "—") return null;
  const ms = Date.parse(raw.replace(" ", "T"));
  return Number.isFinite(ms) ? ms : null;
}

function isHighPriority(priority: string): boolean {
  const p = String(priority || "").toLowerCase();
  return p === "1" || p === "2" || p.includes("high") || p.includes("عالي");
}

function isUnassigned(task: OdooTaskUiRow): boolean {
  if (task.assigneeIds.length) return false;
  const r = String(task.responsible || "").trim();
  return !r || r === "—";
}

export type EnrichProjectsDocumentsScope = "none" | "partial";

export function enrichProjectsWithLinks(
  projects: OdooProjectEnrichedRow[],
  tasks: OdooTaskUiRow[],
  events: Array<{ resModel?: string; resId?: number | null }>,
  documents: Array<{ resModel?: string; resId?: number | null; folderId?: number | null }>,
  documentsScope: EnrichProjectsDocumentsScope = documents.length ? "partial" : "none"
): OdooProjectEnrichedRow[] {
  const now = Date.now();
  const byProject = new Map<number, OdooProjectEnrichedRow>();

  for (const p of projects) {
    byProject.set(p.id, {
      ...p,
      taskCount: p.taskCount,
      openTaskCount: 0,
      overdueTaskCount: 0,
      highPriorityTaskCount: 0,
      unassignedTaskCount: 0,
      linkedEventCount: 0,
      linkedEventConfidence: "partial",
      linkedDocumentCount: documentsScope === "none" ? null : 0,
      linkedDocumentConfidence: documentsScope === "none" ? "needs_browse" : "partial",
    });
  }

  for (const t of tasks) {
    if (!t.projectId || !t.active) continue;
    const row = byProject.get(t.projectId);
    if (!row) continue;
    row.openTaskCount += 1;
    row.taskCount = Math.max(row.taskCount, row.openTaskCount);
    if (isHighPriority(t.priority)) row.highPriorityTaskCount += 1;
    if (isUnassigned(t)) row.unassignedTaskCount += 1;
    const dueMs = parseDeadlineMs(t.deadline);
    if (dueMs != null && dueMs < now) row.overdueTaskCount += 1;
  }

  for (const e of events) {
    if (e.resModel !== "project.project" || !e.resId) continue;
    const row = byProject.get(e.resId);
    if (row) row.linkedEventCount = (row.linkedEventCount ?? 0) + 1;
  }

  if (documentsScope !== "none") {
    for (const d of documents) {
      if (d.resModel === "project.project" && d.resId) {
        const row = byProject.get(d.resId);
        if (row) row.linkedDocumentCount = (row.linkedDocumentCount ?? 0) + 1;
      }
    }
  }

  return projects.map((p) => byProject.get(p.id) ?? p);
}

export function formatProjectLinkedCount(
  count: number | null,
  confidence: OdooRelationshipConfidence,
  locale: string
): string {
  const ar = locale !== "en";
  if (confidence === "needs_browse") {
    return ar ? "لم يُحمَّل" : "Not loaded";
  }
  if (confidence === "unknown") {
    return ar ? "غير معروف" : "Unknown";
  }
  if (count == null) {
    return ar ? "—" : "—";
  }
  if (confidence === "partial") {
    return ar ? `${count}+` : `${count}+`;
  }
  return String(count);
}
