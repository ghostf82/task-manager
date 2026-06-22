/** Map notification payload to a dashboard path (best-effort). */
export function notificationHref(
  type: string,
  payload: Record<string, unknown> | null | undefined
): string | null {
  const p = payload ?? {};
  if (type === "personal_reminder" && typeof p.reminder_id === "string") {
    return "/dashboard/reminders";
  }
  if (typeof p.corporate_task_id === "string") {
    return "/dashboard/tasks";
  }
  if (p.source_type === "corporate_task") {
    return "/dashboard/tasks";
  }
  if (p.source_type === "company_document") {
    return "/dashboard/documents";
  }
  if (type === "expiry_alert") {
    if (p.source_type === "company_document") return "/dashboard/documents";
    if (p.source_type === "corporate_task") return "/dashboard/tasks";
  }
  if (type === "task_follow_up") {
    return "/dashboard/tasks";
  }
  if (type.startsWith("odoo_")) {
    const tab = typeof p.tab === "string" ? p.tab : "tasks";
    const filter = typeof p.filter === "string" ? p.filter : "";
    const qs = new URLSearchParams();
    if (tab && tab !== "dashboard") qs.set("tab", tab);
    if (filter) qs.set("filter", filter);
    const suffix = qs.toString();
    return suffix ? `/dashboard/odoo?${suffix}` : "/dashboard/odoo";
  }
  return null;
}
