import "server-only";

/** P0/P1 schema audit — which Odoo fields we expect vs what the sync layer fetches. */

export type OdooSchemaFieldStatus = "fetched" | "missing" | "partial" | "deferred";

export type OdooEntitySchemaAudit = {
  model: string;
  label: string;
  coveragePercent: number;
  fields: Array<{
    key: string;
    label: string;
    status: OdooSchemaFieldStatus;
    note?: string;
  }>;
};

export type OdooSchemaAuditReport = {
  generatedAt: string;
  entities: OdooEntitySchemaAudit[];
  blockers: string[];
  readyForUi: boolean;
};

const TASK_FIELDS: OdooEntitySchemaAudit = {
  model: "project.task",
  label: "Tasks",
  coveragePercent: 55,
  fields: [
    { key: "id", label: "ID", status: "fetched" },
    { key: "name", label: "Title", status: "fetched" },
    { key: "project_id", label: "Project", status: "fetched" },
    { key: "stage_id", label: "Stage", status: "fetched" },
    { key: "date_deadline", label: "Deadline", status: "fetched" },
    { key: "user_ids", label: "Assignees", status: "fetched" },
    { key: "priority", label: "Priority", status: "fetched" },
    { key: "tag_ids", label: "Tags", status: "fetched" },
    { key: "description", label: "Description", status: "fetched" },
    { key: "message_ids", label: "Chatter", status: "deferred", note: "Phase 2+" },
    { key: "attachment_ids", label: "Attachments", status: "deferred", note: "Phase 2+" },
    { key: "activity_ids", label: "Activities", status: "deferred", note: "Phase 2+" },
  ],
};

const PROJECT_FIELDS: OdooEntitySchemaAudit = {
  model: "project.project",
  label: "Projects",
  coveragePercent: 75,
  fields: [
    { key: "id", label: "ID", status: "fetched" },
    { key: "name", label: "Name", status: "fetched" },
    { key: "user_id", label: "Manager", status: "fetched" },
    { key: "partner_id", label: "Partner", status: "fetched" },
    { key: "description", label: "Description", status: "fetched" },
    { key: "date_start", label: "Start date", status: "fetched" },
    { key: "date", label: "End date", status: "fetched" },
    { key: "tag_ids", label: "Tags", status: "fetched" },
    { key: "task_count", label: "Task count", status: "fetched" },
    { key: "open_task_count", label: "Open tasks", status: "fetched" },
    { key: "linked_events", label: "Linked events", status: "partial", note: "Derived from calendar res_model" },
    { key: "linked_documents", label: "Linked documents", status: "partial", note: "Derived on folder browse" },
  ],
};

const CALENDAR_FIELDS: OdooEntitySchemaAudit = {
  model: "calendar.event",
  label: "Calendar",
  coveragePercent: 70,
  fields: [
    { key: "id", label: "ID", status: "fetched" },
    { key: "name", label: "Title", status: "fetched" },
    { key: "start", label: "Start", status: "fetched" },
    { key: "stop", label: "Stop", status: "fetched" },
    { key: "user_id", label: "Responsible", status: "fetched" },
    { key: "location", label: "Location", status: "fetched" },
    { key: "description", label: "Description", status: "fetched" },
    { key: "res_model", label: "Linked record", status: "fetched" },
    { key: "operational_window", label: "Operational window sync", status: "fetched" },
    { key: "agenda_items", label: "Agenda items", status: "partial", note: "On-demand hydration" },
    { key: "future_archive", label: "Future archive grouping", status: "fetched", note: "UI collapsed by default" },
  ],
};

const DOCUMENT_FIELDS: OdooEntitySchemaAudit = {
  model: "documents.document",
  label: "Documents",
  coveragePercent: 60,
  fields: [
    { key: "id", label: "ID", status: "fetched" },
    { key: "name", label: "Name", status: "fetched" },
    { key: "folder_id", label: "Folder", status: "fetched" },
    { key: "owner_id", label: "Owner", status: "fetched" },
    { key: "file_size", label: "File size", status: "fetched" },
    { key: "mimetype", label: "MIME type", status: "fetched" },
    { key: "res_model", label: "Linked record", status: "fetched" },
    { key: "tag_ids", label: "Tags", status: "fetched" },
    { key: "explorer_pattern", label: "Folder tree + pagination", status: "fetched" },
    { key: "bulk_sync", label: "Bulk sync all docs", status: "deferred", note: "Intentionally disabled" },
    { key: "expiry_date", label: "Expiry / renewal", status: "missing", note: "Odoo field varies by install" },
  ],
};

const FOLDER_FIELDS: OdooEntitySchemaAudit = {
  model: "documents.folder",
  label: "Document folders",
  coveragePercent: 90,
  fields: [
    { key: "id", label: "ID", status: "fetched" },
    { key: "name", label: "Name", status: "fetched" },
    { key: "parent_folder_id", label: "Parent", status: "fetched" },
    { key: "document_count", label: "Document count", status: "fetched" },
    { key: "description", label: "Description", status: "fetched" },
  ],
};

export function buildOdooSchemaAuditReport(): OdooSchemaAuditReport {
  const entities = [TASK_FIELDS, PROJECT_FIELDS, CALENDAR_FIELDS, DOCUMENT_FIELDS, FOLDER_FIELDS];
  const blockers = entities
    .flatMap((e) =>
      e.fields
        .filter((f) => f.status === "missing")
        .map((f) => `${e.label}: ${f.label}`)
    );

  const avg =
    entities.reduce((s, e) => s + e.coveragePercent, 0) / Math.max(entities.length, 1);

  return {
    generatedAt: new Date().toISOString(),
    entities,
    blockers,
    readyForUi: avg >= 50 && blockers.length <= 2,
  };
}
