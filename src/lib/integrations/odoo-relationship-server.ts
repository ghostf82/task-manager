import "server-only";

import { buildOdooRelationshipIndex } from "@/lib/command-center/odoo-relationship-index";
import { buildOdooFolderWorkspaceContext } from "@/lib/command-center/odoo-folder-workspace";
import type {
  OdooFolderWorkspaceContext,
  OdooRelationshipDocumentInput,
  OdooRelationshipIndex,
} from "@/lib/command-center/odoo-relationship-types";
import type { OdooWorkspacePayload } from "@/lib/command-center/load-odoo-workspace-cache";

function asTaskInputs(tasks: unknown[]): Array<{ id: number; name: string; projectId: number | null; active: boolean }> {
  return tasks
    .filter((t) => t && typeof t === "object")
    .map((raw) => {
      const t = raw as Record<string, unknown>;
      return {
        id: Number(t.id),
        name: String(t.name ?? ""),
        projectId: t.projectId != null ? Number(t.projectId) : null,
        active: Boolean(t.active ?? true),
      };
    })
    .filter((t) => Number.isFinite(t.id));
}

function asProjectInputs(projects: unknown[]) {
  return projects
    .filter((p) => p && typeof p === "object")
    .map((raw) => {
      const p = raw as Record<string, unknown>;
      return { id: Number(p.id), name: String(p.name ?? "") };
    })
    .filter((p) => Number.isFinite(p.id));
}

function asEventInputs(events: unknown[]) {
  return events
    .filter((e) => e && typeof e === "object")
    .map((raw) => {
      const e = raw as Record<string, unknown>;
      return {
        id: Number(e.id),
        name: String(e.name ?? ""),
        start: String(e.start ?? ""),
        resModel: String(e.resModel ?? ""),
        resId: e.resId != null ? Number(e.resId) : null,
      };
    })
    .filter((e) => Number.isFinite(e.id));
}

function asFolderInputs(folders: unknown[]) {
  return folders
    .filter((f) => f && typeof f === "object")
    .map((raw) => {
      const f = raw as Record<string, unknown>;
      return {
        id: Number(f.id),
        name: String(f.name ?? ""),
        documentCount: typeof f.documentCount === "number" ? f.documentCount : undefined,
        description: String(f.description ?? ""),
      };
    })
    .filter((f) => Number.isFinite(f.id));
}

export function buildRelationshipIndexFromWorkspace(
  workspace: OdooWorkspacePayload | null,
  extraDocuments: OdooRelationshipDocumentInput[] = []
): OdooRelationshipIndex {
  const tasks = Array.isArray(workspace?.tasks) ? asTaskInputs(workspace.tasks) : [];
  const projects = Array.isArray(workspace?.projects) ? asProjectInputs(workspace.projects) : [];
  const events = Array.isArray(workspace?.events) ? asEventInputs(workspace.events) : [];
  const folders = Array.isArray(workspace?.folders) ? asFolderInputs(workspace.folders) : [];

  return buildOdooRelationshipIndex({
    tasks,
    projects,
    events,
    documents: extraDocuments,
    folders,
    documentsScope: extraDocuments.length ? "folder_sample" : "none",
  });
}

export function buildFolderWorkspaceFromWorkspace(
  workspace: OdooWorkspacePayload | null,
  input: {
    folderId: number;
    folderName: string;
    folderDescription?: string;
    odooDocumentCount?: number;
    documents: OdooRelationshipDocumentInput[];
    loadedOffset: number;
    pageSize: number;
  }
): { index: OdooRelationshipIndex; context: OdooFolderWorkspaceContext } {
  const folders = Array.isArray(workspace?.folders) ? asFolderInputs(workspace.folders) : [];
  const folder =
    folders.find((f) => f.id === input.folderId) ?? {
      id: input.folderId,
      name: input.folderName,
      description: input.folderDescription ?? "",
      documentCount: input.odooDocumentCount,
    };

  return buildOdooFolderWorkspaceContext({
    folder,
    documents: input.documents,
    loadedOffset: input.loadedOffset,
    pageSize: input.pageSize,
    tasks: Array.isArray(workspace?.tasks) ? asTaskInputs(workspace.tasks) : [],
    projects: Array.isArray(workspace?.projects) ? asProjectInputs(workspace.projects) : [],
    events: Array.isArray(workspace?.events) ? asEventInputs(workspace.events) : [],
    folders,
  });
}
