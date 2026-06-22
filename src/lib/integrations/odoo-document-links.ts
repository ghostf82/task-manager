/**
 * Odoo deep links for alomraniah-style instances (`https://host/odoo/...`).
 *
 * Verified patterns (Odoo 17):
 * - Documents list: {appRoot}/documents?view_type=list
 * - Calendar:       {appRoot}/calendar?view_type=list
 * - Projects:       {appRoot}/action-883?view_type=list
 * - File download:  {webRoot}/web/content/{id}?download=true
 * - Record form:    {webRoot}/web#id={id}&model={model}&view_type=form
 *
 * NEVER use {appRoot}/web/... — Odoo interprets "web" as an action → error.
 */

import { parseOdooUrlBases } from "@/lib/integrations/odoo-url-bases";

export type OdooDocumentLinkMode = "documents_app" | "attachment" | "linked_record";

function bases(baseUrl: string) {
  return parseOdooUrlBases(baseUrl);
}

/** Binary download (documents.document or ir.attachment). */
export function odooDocumentDownloadUrl(baseUrl: string, documentId: number): string {
  const { webRoot } = bases(baseUrl);
  if (!webRoot || !documentId) return "#";
  return `${webRoot}/web/content/${documentId}?download=true`;
}

/** Open document preview in browser (inline). */
export function odooDocumentContentUrl(baseUrl: string, documentId: number): string {
  const { webRoot } = bases(baseUrl);
  if (!webRoot || !documentId) return "#";
  return `${webRoot}/web/content/${documentId}`;
}

/** Open in Odoo Documents app (preferred for documents.document). */
export function odooDocumentsRecordUrl(baseUrl: string, documentId: number): string {
  const { appRoot } = bases(baseUrl);
  if (!appRoot || !documentId) return odooDocumentContentUrl(baseUrl, documentId);
  return `${appRoot}/documents/${documentId}`;
}

/** Documents app home or folder filter. */
export function odooDocumentsAppUrl(baseUrl: string, folderId?: number | null): string {
  const { appRoot } = bases(baseUrl);
  if (!appRoot) return "#";
  const params = new URLSearchParams({ view_type: "list" });
  if (folderId != null && folderId > 0) {
    params.set("folder_id", String(folderId));
  }
  return `${appRoot}/documents?${params.toString()}`;
}

/** Legacy hash form on /web (project.task, project.project, calendar.event, …). */
export function odooWebRecordFormUrl(baseUrl: string, resModel: string, resId: number): string {
  const { webRoot } = bases(baseUrl);
  if (!webRoot || !resModel || !resId) return "#";
  return `${webRoot}/web#id=${resId}&model=${encodeURIComponent(resModel)}&view_type=form`;
}

export function odooDocumentOpenUrl(
  baseUrl: string,
  documentId: number,
  resModel?: string,
  resId?: number | null,
  options?: { preferDocumentsApp?: boolean }
): string {
  const model = String(resModel ?? "").trim();
  const linkedId = resId != null && Number.isFinite(resId) && resId > 0 ? Number(resId) : null;

  if (linkedId && model && model !== "documents.document" && model !== "ir.attachment") {
    return odooWebRecordFormUrl(baseUrl, model, linkedId);
  }

  if (model === "ir.attachment" || options?.preferDocumentsApp === false) {
    return odooDocumentContentUrl(baseUrl, documentId);
  }

  return odooDocumentsRecordUrl(baseUrl, documentId);
}

/** Example URLs for debugging — safe to log in dev. */
export function odooDocumentLinkExamples(baseUrl: string) {
  const sampleId = 123;
  return {
    baseUrl,
    bases: bases(baseUrl),
    documentsList: odooDocumentsAppUrl(baseUrl),
    documentsFolder: odooDocumentsAppUrl(baseUrl, 5840),
    documentRecord: odooDocumentsRecordUrl(baseUrl, sampleId),
    download: odooDocumentDownloadUrl(baseUrl, sampleId),
    content: odooDocumentContentUrl(baseUrl, sampleId),
    projectForm: odooWebRecordFormUrl(baseUrl, "project.project", sampleId),
  };
}
