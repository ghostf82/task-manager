import type {
  OdooRelationshipDocumentInput,
  OdooRelationshipEventInput,
  OdooRelationshipFolderInput,
  OdooRelationshipIndex,
  OdooRelationshipIndexSources,
  OdooRelationshipProjectInput,
  OdooRelationshipTaskInput,
} from "@/lib/command-center/odoo-relationship-types";

function uniq(nums: number[]): number[] {
  return [...new Set(nums.filter((n) => Number.isFinite(n) && n > 0))];
}

function pushId(list: number[], id: number) {
  if (!Number.isFinite(id) || id <= 0) return;
  if (!list.includes(id)) list.push(id);
}

function resolveResLink(
  resModel: string | undefined,
  resId: number | null | undefined
): { kind: "project" | "task" | "event" | null; id: number | null } {
  const model = String(resModel || "").trim();
  const id = resId != null && Number.isFinite(resId) ? Number(resId) : null;
  if (!model || id == null || id <= 0) return { kind: null, id: null };
  if (model === "project.project") return { kind: "project", id };
  if (model === "project.task") return { kind: "task", id };
  if (model === "calendar.event") return { kind: "event", id };
  return { kind: null, id: null };
}

export type BuildOdooRelationshipIndexInput = {
  tasks?: OdooRelationshipTaskInput[];
  projects?: OdooRelationshipProjectInput[];
  events?: OdooRelationshipEventInput[];
  documents?: OdooRelationshipDocumentInput[];
  folders?: OdooRelationshipFolderInput[];
  documentsScope?: OdooRelationshipIndexSources["documentsScope"];
};

export function buildOdooRelationshipIndex(input: BuildOdooRelationshipIndexInput): OdooRelationshipIndex {
  const tasks = input.tasks ?? [];
  const projects = input.projects ?? [];
  const events = input.events ?? [];
  const documents = input.documents ?? [];
  const folders = input.folders ?? [];
  const documentsScope = input.documentsScope ?? (documents.length ? "folder_sample" : "none");

  const entities: OdooRelationshipIndex["entities"] = {
    projects: {},
    tasks: {},
    events: {},
    documents: {},
    folders: {},
  };

  const byProject: OdooRelationshipIndex["byProject"] = {};
  const byFolder: OdooRelationshipIndex["byFolder"] = {};
  const byTask: OdooRelationshipIndex["byTask"] = {};
  const byEvent: OdooRelationshipIndex["byEvent"] = {};

  for (const p of projects) {
    if (!p.id) continue;
    entities.projects[p.id] = { id: p.id, name: p.name };
    byProject[p.id] = { taskIds: [], eventIds: [], documentIds: [], folderIds: [] };
  }

  for (const f of folders) {
    if (!f.id) continue;
    entities.folders[f.id] = { id: f.id, name: f.name };
    byFolder[f.id] = { documentIds: [], projectIds: [], taskIds: [], eventIds: [] };
  }

  for (const t of tasks) {
    if (!t.id) continue;
    const projectId = t.projectId != null && Number.isFinite(t.projectId) ? t.projectId : null;
    entities.tasks[t.id] = { id: t.id, name: t.name, projectId };
    byTask[t.id] = { documentIds: [], eventIds: [] };
    if (projectId && byProject[projectId]) {
      pushId(byProject[projectId].taskIds, t.id);
    }
  }

  for (const e of events) {
    if (!e.id) continue;
    entities.events[e.id] = { id: e.id, name: e.name, start: String(e.start ?? "") };
    byEvent[e.id] = { projectIds: [], taskIds: [], documentIds: [] };
    const link = resolveResLink(e.resModel, e.resId);
    if (link.kind === "project" && link.id && byProject[link.id]) {
      pushId(byProject[link.id].eventIds, e.id);
      pushId(byEvent[e.id].projectIds, link.id);
    }
    if (link.kind === "task" && link.id) {
      if (!byTask[link.id]) byTask[link.id] = { documentIds: [], eventIds: [] };
      pushId(byTask[link.id].eventIds, e.id);
      pushId(byEvent[e.id].taskIds, link.id);
    }
  }

  for (const d of documents) {
    if (!d.id) continue;
    const folderId = d.folderId != null && Number.isFinite(d.folderId) ? d.folderId : null;
    entities.documents[d.id] = {
      id: d.id,
      name: d.name,
      folderId,
      resModel: String(d.resModel ?? ""),
      resId: d.resId != null && Number.isFinite(d.resId) ? d.resId : null,
    };

    if (folderId) {
      if (!byFolder[folderId]) {
        byFolder[folderId] = { documentIds: [], projectIds: [], taskIds: [], eventIds: [] };
      }
      pushId(byFolder[folderId].documentIds, d.id);
    }

    const link = resolveResLink(d.resModel, d.resId);
    if (link.kind === "project" && link.id) {
      if (!byProject[link.id]) {
        byProject[link.id] = { taskIds: [], eventIds: [], documentIds: [], folderIds: [] };
      }
      pushId(byProject[link.id].documentIds, d.id);
      if (folderId && byFolder[folderId]) {
        pushId(byFolder[folderId].projectIds, link.id);
      }
    }
    if (link.kind === "task" && link.id) {
      if (!byTask[link.id]) byTask[link.id] = { documentIds: [], eventIds: [] };
      pushId(byTask[link.id].documentIds, d.id);
      if (folderId && byFolder[folderId]) {
        pushId(byFolder[folderId].taskIds, link.id);
      }
    }
    if (link.kind === "event" && link.id) {
      if (!byEvent[link.id]) byEvent[link.id] = { projectIds: [], taskIds: [], documentIds: [] };
      pushId(byEvent[link.id].documentIds, d.id);
      if (folderId && byFolder[folderId]) {
        pushId(byFolder[folderId].eventIds, link.id);
      }
    }
  }

  // Name heuristic: folder name matches project name → soft link (partial)
  for (const f of folders) {
    if (!f.id || !f.name) continue;
    const normalized = f.name.trim().toLowerCase();
    if (!normalized) continue;
    for (const p of projects) {
      if (p.name.trim().toLowerCase() === normalized) {
        if (!byFolder[f.id]) {
          byFolder[f.id] = { documentIds: [], projectIds: [], taskIds: [], eventIds: [] };
        }
        if (!byFolder[f.id].projectIds.includes(p.id)) {
          byFolder[f.id].projectIds.push(p.id);
        }
        if (byProject[p.id] && !byProject[p.id].folderIds.includes(f.id)) {
          byProject[p.id].folderIds.push(f.id);
        }
      }
    }
  }

  // Normalize sets
  for (const pid of Object.keys(byProject)) {
    const row = byProject[Number(pid)];
    row.taskIds = uniq(row.taskIds);
    row.eventIds = uniq(row.eventIds);
    row.documentIds = uniq(row.documentIds);
    row.folderIds = uniq(row.folderIds);
  }
  for (const fid of Object.keys(byFolder)) {
    const row = byFolder[Number(fid)];
    row.documentIds = uniq(row.documentIds);
    row.projectIds = uniq(row.projectIds);
    row.taskIds = uniq(row.taskIds);
    row.eventIds = uniq(row.eventIds);
  }

  return {
    builtAt: new Date().toISOString(),
    sources: {
      tasks: tasks.length,
      projects: projects.length,
      events: events.length,
      documentsLoaded: documents.length,
      folders: folders.length,
      documentsScope,
    },
    entities,
    byProject,
    byFolder,
    byTask,
    byEvent,
  };
}
