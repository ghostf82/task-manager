/** Client-safe Odoo relationship layer types (Phase 2A). */

export type OdooRelationshipConfidence =
  | "known"
  | "partial"
  | "unknown"
  | "unavailable"
  | "needs_browse";

export type OdooRelationshipCount = {
  confidence: OdooRelationshipConfidence;
  /** Null when confidence is unknown / unavailable. */
  count: number | null;
  noteAr?: string;
  noteEn?: string;
};

export type OdooLinkedEntityRef = {
  model: string;
  id: number;
  name: string;
  meta?: string;
};

export type OdooRelationshipDocumentInput = {
  id: number;
  name: string;
  folderId?: number | null;
  resModel?: string;
  resId?: number | null;
  owner?: string;
  creator?: string;
  mimetype?: string;
  fileSize?: number | null;
  createdAt?: string;
  writeDate?: string;
  expirationDate?: string | null;
};

export type OdooRelationshipTaskInput = {
  id: number;
  name: string;
  projectId?: number | null;
  active?: boolean;
};

export type OdooRelationshipProjectInput = {
  id: number;
  name: string;
};

export type OdooRelationshipEventInput = {
  id: number;
  name: string;
  start?: string;
  resModel?: string;
  resId?: number | null;
};

export type OdooRelationshipFolderInput = {
  id: number;
  name: string;
  documentCount?: number;
  description?: string;
};

export type OdooRelationshipIndexSources = {
  tasks: number;
  projects: number;
  events: number;
  documentsLoaded: number;
  folders: number;
  documentsScope: "none" | "folder_sample" | "workspace_cache";
};

export type OdooRelationshipIndex = {
  builtAt: string;
  sources: OdooRelationshipIndexSources;
  entities: {
    projects: Record<number, { id: number; name: string }>;
    tasks: Record<number, { id: number; name: string; projectId: number | null }>;
    events: Record<number, { id: number; name: string; start: string }>;
    documents: Record<number, { id: number; name: string; folderId: number | null; resModel: string; resId: number | null }>;
    folders: Record<number, { id: number; name: string }>;
  };
  byProject: Record<
    number,
    { taskIds: number[]; eventIds: number[]; documentIds: number[]; folderIds: number[] }
  >;
  byFolder: Record<
    number,
    { documentIds: number[]; projectIds: number[]; taskIds: number[]; eventIds: number[] }
  >;
  byTask: Record<number, { documentIds: number[]; eventIds: number[] }>;
  byEvent: Record<number, { projectIds: number[]; taskIds: number[]; documentIds: number[] }>;
};

export type OdooDocumentRiskStatus = "ok" | "expiring_soon" | "expired" | "unknown";

export type OdooFolderWorkspaceContext = {
  folder: {
    id: number;
    name: string;
    description: string;
    odooDocumentCount: number | null;
    loadedDocumentCount: number;
    loadedOffset: number;
    hasMoreDocuments: boolean;
  };
  summary: {
    owners: Array<{ name: string; count: number }>;
    mimeDistribution: Array<{ category: string; count: number }>;
    lastActivityAt: string | null;
    largestFiles: Array<{ id: number; name: string; fileSize: number | null }>;
    recentFiles: Array<{ id: number; name: string; createdAt: string }>;
  };
  attention: {
    expired: Array<{ id: number; name: string; reason: string }>;
    expiringSoon: Array<{ id: number; name: string; reason: string }>;
    missingMetadataCount: number;
  };
  linked: {
    projects: OdooLinkedEntityRef[];
    tasks: OdooLinkedEntityRef[];
    events: OdooLinkedEntityRef[];
  };
  relationships: {
    documents: OdooRelationshipCount;
    projects: OdooRelationshipCount;
    tasks: OdooRelationshipCount;
    events: OdooRelationshipCount;
  };
  recommendedActions: Array<{
    id: string;
    labelAr: string;
    labelEn: string;
  }>;
  partialDataNoteAr: string | null;
  partialDataNoteEn: string | null;
};

export function relationshipCount(
  confidence: OdooRelationshipConfidence,
  count: number | null,
  noteAr?: string,
  noteEn?: string
): OdooRelationshipCount {
  return { confidence, count, noteAr, noteEn };
}

export function formatRelationshipLabel(rc: OdooRelationshipCount, locale: string): string {
  const ar = locale !== "en";
  if (rc.noteAr && ar) return rc.noteAr;
  if (rc.noteEn && !ar) return rc.noteEn;
  switch (rc.confidence) {
    case "known":
      return String(rc.count ?? 0);
    case "partial":
      return ar ? `${rc.count ?? "؟"} (جزئي)` : `${rc.count ?? "?"} (partial)`;
    case "unknown":
      return ar ? "غير محمّل" : "Not loaded";
    case "needs_browse":
      return ar ? "افتح المجلد" : "Browse folder";
    case "unavailable":
      return ar ? "غير متاح" : "N/A";
    default:
      return "—";
  }
}
