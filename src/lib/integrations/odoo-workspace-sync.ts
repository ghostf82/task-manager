import "server-only";

import type { OdooCredentialBundle, OdooDocumentFolderLite } from "@/lib/integrations/odoo-client";
import type { OdooDocumentsExplorerMode } from "@/lib/integrations/odoo-documents-constants";
import {
  listOdooCalendarEventsViaWebLogin,
  listOdooDocumentFoldersViaWebLogin,
  listOdooProjectsViaWebLogin,
  searchOdooTasksViaWebLogin,
} from "@/lib/integrations/odoo-client";
import { operationalCalendarWindow } from "@/lib/integrations/odoo-calendar-windows";
import { buildOdooDataCoverageReport } from "@/lib/integrations/odoo-coverage";
import {
  enrichProjectsWithLinks,
  type OdooProjectEnrichedRow,
} from "@/lib/integrations/odoo-project-enrich";
import { enrichOdooWebTasksToUiRows } from "@/lib/integrations/odoo-task-enrich";

export type { OdooProjectEnrichedRow } from "@/lib/integrations/odoo-project-enrich";

export type OdooDocumentFolderRow = {
  id: number;
  name: string;
  parentFolderId: number | null;
  parentFolderName: string;
  description: string;
  documentCount: number;
};

export function mapOdooDocumentFolderLiteToRow(f: OdooDocumentFolderLite): OdooDocumentFolderRow {
  return {
    id: f.id,
    name: f.name,
    parentFolderId: Array.isArray(f.parent_folder_id)
      ? Number(f.parent_folder_id[0])
      : typeof f.parent_folder_id === "number"
        ? f.parent_folder_id
        : null,
    parentFolderName: Array.isArray(f.parent_folder_id) ? String(f.parent_folder_id[1]) : "—",
    description: typeof f.description === "string" ? f.description : "",
    documentCount: typeof f.document_count === "number" ? f.document_count : 0,
  };
}

function stripHtml(html: string): string {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type RawProject = Awaited<ReturnType<typeof listOdooProjectsViaWebLogin>>["projects"][number];

export function mapRawProjectToEnriched(p: RawProject): OdooProjectEnrichedRow {
  const tagLabels = "tag_labels" in p && Array.isArray((p as { tag_labels?: string[] }).tag_labels)
    ? ((p as { tag_labels: string[] }).tag_labels)
    : [];
  const tagIds = "tag_ids" in p && Array.isArray((p as { tag_ids?: number[] }).tag_ids)
    ? ((p as { tag_ids: number[] }).tag_ids)
    : [];

  return {
    id: p.id,
    name: p.name,
    active: Boolean(p.active ?? true),
    creator: Array.isArray(p.create_uid) ? String(p.create_uid[1]) : "—",
    creatorId: Array.isArray(p.create_uid) ? Number(p.create_uid[0]) : null,
    manager: Array.isArray(p.user_id) ? String(p.user_id[1]) : "—",
    managerId: Array.isArray(p.user_id) ? Number(p.user_id[0]) : null,
    visibility: typeof p.privacy_visibility === "string" ? p.privacy_visibility : "—",
    createdAt: typeof p.create_date === "string" ? p.create_date : "",
    partner: Array.isArray(p.partner_id) ? String(p.partner_id[1]) : "—",
    partnerId: Array.isArray(p.partner_id) ? Number(p.partner_id[0]) : null,
    description: typeof p.description === "string" ? p.description : "",
    descriptionPlain: typeof p.description === "string" ? stripHtml(p.description) : "",
    dateStart: typeof p.date_start === "string" ? p.date_start : "",
    dateEnd: typeof p.date === "string" ? p.date : "",
    tags: tagLabels,
    tagIds,
    taskCount: typeof p.task_count === "number" ? p.task_count : 0,
    openTaskCount: typeof p.open_task_count === "number" ? p.open_task_count : 0,
    overdueTaskCount: 0,
    highPriorityTaskCount: 0,
    unassignedTaskCount: 0,
    linkedEventCount: 0,
    linkedEventConfidence: "partial",
    linkedDocumentCount: null,
    linkedDocumentConfidence: "needs_browse",
  };
}

export type OdooWorkspaceSyncPayload = {
  tasks: Awaited<ReturnType<typeof enrichOdooWebTasksToUiRows>>;
  projects: OdooProjectEnrichedRow[];
  events: ReturnType<typeof mapCalendarEventsToPanelRows>;
  documents: [];
  folders: OdooDocumentFolderRow[];
  meta: {
    coverage: Awaited<ReturnType<typeof buildOdooDataCoverageReport>>;
    calendarWindow: ReturnType<typeof operationalCalendarWindow>;
    syncMode: "phase0";
    documentsMode: OdooDocumentsExplorerMode;
    documentsWarning?: string | null;
    documentsTechnicalDetail?: string | null;
  };
};

export function mapCalendarEventsToPanelRows(
  events: Awaited<ReturnType<typeof listOdooCalendarEventsViaWebLogin>>["events"]
) {
  return events.map((e) => ({
    id: e.id,
    name: e.name,
    start: String(e.start ?? ""),
    stop: String(e.stop ?? ""),
    allday: Boolean(e.allday ?? false),
    creator: Array.isArray(e.create_uid) ? String(e.create_uid[1]) : "—",
    responsible: Array.isArray(e.user_id) ? String(e.user_id[1]) : "—",
    responsibleId: Array.isArray(e.user_id) ? Number(e.user_id[0]) : undefined,
    partnerIds: Array.isArray(e.partner_ids) ? e.partner_ids.map(Number) : [],
    location: typeof e.location === "string" ? e.location : "",
    description: typeof e.description === "string" ? e.description : "",
    active: Boolean(e.active ?? true),
    resModel: typeof e.res_model === "string" ? e.res_model : "",
    resId: typeof e.res_id === "number" && Number.isFinite(e.res_id) ? e.res_id : null,
    agendaLines: Array.isArray(e.agendaLines)
      ? e.agendaLines.map((a) => ({
          id: a.id,
          summary: a.summary,
          note: a.notePlain,
          state: a.state,
          dateDeadline: a.dateDeadline,
        }))
      : [],
    agendaItems: Array.isArray(e.agendaItems)
      ? e.agendaItems.map((it) => ({
          id: it.id,
          sequence: it.sequence,
          name: it.name,
          description: it.descriptionPlain,
          discussed: it.discussed,
        }))
      : [],
    partners: (e.partners ?? []).map((p) => ({ id: Number(p.id), name: String(p.name ?? "") })),
  }));
}

export async function syncOdooWorkspacePhase0(
  bundle: OdooCredentialBundle,
  input?: { text?: string; mineOnly?: boolean }
): Promise<{ ok: true; payload: OdooWorkspaceSyncPayload } | { ok: false; error: string }> {
  const win = operationalCalendarWindow();

  const [tasksRes, projectsRes, eventsRes, foldersRes] = await Promise.all([
    searchOdooTasksViaWebLogin({
      bundle,
      text: input?.text,
      limit: 200,
      mineOnly: Boolean(input?.mineOnly ?? false),
    }),
    listOdooProjectsViaWebLogin({
      bundle,
      text: input?.text,
      limit: 200,
      mineOnly: Boolean(input?.mineOnly ?? false),
    }),
    listOdooCalendarEventsViaWebLogin({
      bundle,
      text: input?.text,
      limit: 300,
      mineOnly: Boolean(input?.mineOnly ?? false),
      startFrom: win.startFrom,
      startBefore: win.startBefore,
      order: "start asc",
      includeAgendaDetails: false,
    }),
    listOdooDocumentFoldersViaWebLogin({ bundle, limit: 500 }),
  ]);

  if (tasksRes.error) return { ok: false, error: tasksRes.error };
  if (projectsRes.error) return { ok: false, error: projectsRes.error };
  if (eventsRes.error) return { ok: false, error: eventsRes.error };

  const folderRows = foldersRes.folders.map(mapOdooDocumentFolderLiteToRow);

  const tasks = await enrichOdooWebTasksToUiRows(bundle, tasksRes.tasks);
  const projectsBase = projectsRes.projects.map(mapRawProjectToEnriched);
  const eventsForLinks = eventsRes.events.map((e) => ({
    resModel: typeof e.res_model === "string" ? e.res_model : "",
    resId: typeof e.res_id === "number" ? e.res_id : null,
  }));
  const projects = enrichProjectsWithLinks(projectsBase, tasks, eventsForLinks, [], "none");
  const events = mapCalendarEventsToPanelRows(eventsRes.events);

  const coverage = await buildOdooDataCoverageReport(bundle, {
    tasks,
    projects,
    events: eventsRes.events,
    documents: [],
    folders: foldersRes.folders,
  });

  return {
    ok: true,
    payload: {
      tasks,
      projects,
      events,
      documents: [],
      folders: folderRows,
      meta: {
        coverage,
        calendarWindow: win,
        syncMode: "phase0",
        documentsMode: foldersRes.mode,
        documentsWarning: foldersRes.userMessage ?? foldersRes.error ?? null,
        documentsTechnicalDetail: foldersRes.technicalDetail ?? null,
      },
    },
  };
}

export async function loadOdooCoverageReport(
  bundle: OdooCredentialBundle,
  snapshot: {
    tasks?: unknown[];
    projects?: unknown[];
    events?: unknown[];
    documents?: unknown[];
    folders?: unknown[];
  }
) {
  return buildOdooDataCoverageReport(bundle, snapshot);
}
