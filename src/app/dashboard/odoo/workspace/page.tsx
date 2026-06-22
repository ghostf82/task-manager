import { redirect } from "next/navigation";

export const maxDuration = 120;

const VALID_TABS = new Set(["tasks", "projects", "calendar", "documents"]);

export default async function OdooWorkspaceRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ zone?: string }>;
}) {
  const sp = await searchParams;
  const zone = sp.zone && VALID_TABS.has(sp.zone) ? sp.zone : null;
  redirect(zone ? `/dashboard/odoo?tab=${zone}` : "/dashboard/odoo");
}
