/** Client-safe URL helpers for /dashboard/odoo tab/filter/folder state without RSC navigation. */

export type OdooWorkspaceUrlParams = {
  tab?: string | null;
  filter?: string | null;
  folder?: number | null;
};

export function buildOdooWorkspaceUrl({
  tab,
  filter,
  folder,
}: OdooWorkspaceUrlParams): string {
  const params = new URLSearchParams();
  if (tab && tab !== "dashboard") params.set("tab", tab);
  if (filter) params.set("filter", filter);
  if (folder != null && Number.isFinite(folder)) params.set("folder", String(folder));
  const qs = params.toString();
  return qs ? `/dashboard/odoo?${qs}` : "/dashboard/odoo";
}

/** Updates the address bar without triggering a Next.js RSC fetch (avoids aborted-fetch noise). */
export function replaceOdooWorkspaceUrl(params: OdooWorkspaceUrlParams): void {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", buildOdooWorkspaceUrl(params));
}

export function readOdooWorkspaceUrl(): OdooWorkspaceUrlParams {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const folderRaw = params.get("folder");
  const folder = folderRaw != null ? Number(folderRaw) : null;
  return {
    tab: params.get("tab"),
    filter: params.get("filter"),
    folder: Number.isFinite(folder) ? folder : null,
  };
}
