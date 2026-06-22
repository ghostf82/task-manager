/** Client-safe Odoo document / attachment deep links. */

export function odooDocumentDownloadUrl(baseUrl: string, documentId: number): string {
  const root = baseUrl.replace(/\/$/, "");
  return `${root}/web/content/${documentId}?download=true`;
}

export function odooDocumentOpenUrl(
  baseUrl: string,
  documentId: number,
  resModel?: string,
  resId?: number | null
): string {
  const root = baseUrl.replace(/\/$/, "");
  if (resModel && resId != null && resId > 0) {
    return `${root}/web#id=${resId}&model=${encodeURIComponent(resModel)}&view_type=form`;
  }
  return `${root}/web/content/${documentId}`;
}

export function odooDocumentsAppUrl(baseUrl: string, folderId?: number | null): string {
  const root = baseUrl.replace(/\/$/, "");
  if (folderId != null && folderId > 0) {
    return `${root}/odoo/documents?folder_id=${folderId}`;
  }
  return `${root}/odoo/documents`;
}
