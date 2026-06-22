import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { OdooOperationalBrief } from "@/lib/command-center/odoo-operational-brief";

export type OdooAlertSeverity = "critical" | "warning" | "info";

export type OdooAlertDraft = {
  dedupKey: string;
  type: string;
  severity: OdooAlertSeverity;
  title: string;
  body: string;
  payload: Record<string, unknown>;
};

function buildAlertsFromBrief(brief: OdooOperationalBrief): OdooAlertDraft[] {
  const alerts: OdooAlertDraft[] = [];
  const c = brief.counts;

  if (c.overdueTasks > 0) {
    alerts.push({
      dedupKey: "odoo:overdue_tasks",
      type: "odoo_overdue_tasks",
      severity: "critical",
      title: `${c.overdueTasks} مهمة متأخرة في Odoo`,
      body: "راجع المهام المتأخرة واتخذ إجراءً فورياً.",
      payload: { filter: "overdue", tab: "tasks", count: c.overdueTasks },
    });
  }

  if (c.due7Days > 0) {
    alerts.push({
      dedupKey: "odoo:due_soon",
      type: "odoo_due_soon",
      severity: "warning",
      title: `${c.due7Days} مهمة تستحق خلال 7 أيام`,
      body: "خطّط للمهام القريبة من الاستحقاق.",
      payload: { filter: "due_soon", tab: "tasks", count: c.due7Days },
    });
  }

  if (c.highPriorityTasks > 0) {
    alerts.push({
      dedupKey: "odoo:high_priority",
      type: "odoo_high_priority",
      severity: "warning",
      title: `${c.highPriorityTasks} مهمة عالية الأولوية`,
      body: "أولوية عالية — تحتاج متابعة.",
      payload: { filter: "high_priority", tab: "tasks", count: c.highPriorityTasks },
    });
  }

  if (c.unassignedTasks > 0) {
    alerts.push({
      dedupKey: "odoo:unassigned",
      type: "odoo_unassigned_tasks",
      severity: "warning",
      title: `${c.unassignedTasks} مهمة غير مسندة`,
      body: "عيّن مسؤولاً للمهام غير المسندة.",
      payload: { filter: "unassigned", tab: "tasks", count: c.unassignedTasks },
    });
  }

  if (c.complianceOverdue > 0) {
    alerts.push({
      dedupKey: "odoo:compliance_overdue",
      type: "odoo_compliance_overdue",
      severity: "critical",
      title: `${c.complianceOverdue} مستند امتثال منتهٍ`,
      body: "تجديد فوري مطلوب.",
      payload: { filter: "compliance", tab: "documents", count: c.complianceOverdue },
    });
  }

  if (c.complianceWarning > 0) {
    alerts.push({
      dedupKey: "odoo:compliance_warning",
      type: "odoo_compliance_warning",
      severity: "warning",
      title: `${c.complianceWarning} مستند يقترب انتهاؤه`,
      body: "راجع تجديدات الامتثال.",
      payload: { filter: "compliance", tab: "documents", count: c.complianceWarning },
    });
  }

  if (brief.syncStale) {
    alerts.push({
      dedupKey: "odoo:sync_stale",
      type: "odoo_sync_stale",
      severity: "info",
      title: "بيانات Odoo قديمة",
      body: "يُنصح بمزامنة مساحة العمل الآن.",
      payload: { action: "sync", tab: "dashboard" },
    });
  }

  for (const item of brief.attentionQueue.slice(0, 3)) {
    if (item.severity !== "critical") continue;
    alerts.push({
      dedupKey: `odoo:attention:${item.id}`,
      type: "odoo_attention",
      severity: "critical",
      title: item.title,
      body: item.subtitle ?? item.dueLabel ?? "يتطلب اهتماماً فورياً",
      payload: {
        attentionId: item.id,
        kind: item.kind,
        tab: item.kind === "calendar_event" ? "calendar" : item.kind === "compliance_doc" ? "documents" : "tasks",
      },
    });
  }

  return alerts;
}

/** Upsert Odoo workspace alerts — deduped by payload.dedupKey, no spam. */
export async function syncOdooWorkspaceAlerts(
  supabase: SupabaseClient,
  userId: string,
  brief: OdooOperationalBrief
): Promise<{ created: number; updated: number }> {
  if (!brief.connected) return { created: 0, updated: 0 };

  const drafts = buildAlertsFromBrief(brief);
  let created = 0;
  let updated = 0;

  const { data: existing } = await supabase
    .from("notifications")
    .select("id,payload,read_at")
    .eq("user_id", userId)
    .is("archived_at", null)
    .like("type", "odoo_%")
    .order("created_at", { ascending: false })
    .limit(50);

  const byDedup = new Map<string, { id: string; read_at: string | null }>();
  for (const row of existing ?? []) {
    const key = (row.payload as { dedupKey?: string })?.dedupKey;
    if (key && !byDedup.has(key)) byDedup.set(key, { id: row.id, read_at: row.read_at });
  }

  const activeKeys = new Set(drafts.map((d) => d.dedupKey));

  for (const draft of drafts) {
    const prev = byDedup.get(draft.dedupKey);
    const payload = { ...draft.payload, dedupKey: draft.dedupKey, severity: draft.severity };

    if (prev) {
      await supabase
        .from("notifications")
        .update({
          title: draft.title,
          body: draft.body,
          payload,
          read_at: prev.read_at,
        })
        .eq("id", prev.id)
        .eq("user_id", userId);
      updated += 1;
    } else {
      const { error } = await supabase.from("notifications").insert({
        user_id: userId,
        type: draft.type,
        title: draft.title,
        body: draft.body,
        payload,
      });
      if (!error) created += 1;
    }
  }

  // Archive resolved Odoo alerts no longer active
  for (const [key, row] of byDedup) {
    if (!activeKeys.has(key)) {
      await supabase
        .from("notifications")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("user_id", userId);
    }
  }

  return { created, updated };
}
