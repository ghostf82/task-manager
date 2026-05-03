import type { SupabaseClient } from "@supabase/supabase-js";

import { collectExpiryAlertRecipientIds } from "@/lib/expiry-cron/recipients";
import { loadEmailCredentialBundle } from "@/lib/ai-agent/load-user-integrations";
import { sendSmtpReply } from "@/lib/integrations/email-client";
import { getLicensedActiveToolSlugs } from "@/lib/ai-tools/user-licenses";
import { documentDaysUntilExpiry } from "@/lib/company-documents";

export type ExpiryCronResult = {
  ok: true;
  calendarDate: string;
  documentsApproaching: number;
  documentsOverdue: number;
  tasksApproaching: number;
  tasksOverdue: number;
  notificationsInserted: number;
  emailsSent: number;
  skippedDedupe: number;
  errors: string[];
};

function todayUtcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function taskAlertDaysBefore(): number {
  const raw = process.env.CORPORATE_TASK_EXPIRY_ALERT_DAYS;
  const n = raw ? parseInt(raw, 10) : 7;
  return Number.isFinite(n) && n >= 0 && n <= 365 ? n : 7;
}

async function tryInsertDedupe(
  admin: SupabaseClient,
  row: {
    source_type: "company_document" | "corporate_task";
    source_id: string;
    alert_kind: "approaching" | "overdue";
    calendar_date: string;
  }
): Promise<boolean> {
  const { error } = await admin.from("expiry_alert_dedupe").insert(row);
  if (!error) return true;
  const code = (error as { code?: string }).code;
  if (code === "23505" || /duplicate key|unique constraint/i.test(error.message)) {
    return false;
  }
  throw new Error(error.message);
}

async function notifyRecipients(params: {
  admin: SupabaseClient;
  tenantId: string;
  tenantName: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
}): Promise<{ notifications: number; emails: number; errors: string[] }> {
  const errors: string[] = [];
  let notifications = 0;
  let emails = 0;

  const recipientIds = await collectExpiryAlertRecipientIds(
    params.admin,
    params.tenantId
  );

  const { data: profiles } = await params.admin
    .from("users")
    .select("id, email")
    .in("id", recipientIds);

  const emailByUser = new Map(
    (profiles ?? []).map((p) => [p.id as string, (p.email as string) ?? ""])
  );

  for (const uid of recipientIds) {
    const { error: nErr } = await params.admin.from("notifications").insert({
      user_id: uid,
      type: "expiry_alert",
      title: params.title,
      body: params.body,
      payload: params.payload,
    });
    if (nErr) {
      errors.push(`notify ${uid}: ${nErr.message}`);
      continue;
    }
    notifications++;

    const to = emailByUser.get(uid)?.trim();
    if (!to || !to.includes("@")) continue;

    const licensed = await getLicensedActiveToolSlugs(params.admin, uid);
    if (!licensed.includes("email")) continue;

    const bundle = await loadEmailCredentialBundle(params.admin, uid);
    if (!bundle) continue;

    try {
      await sendSmtpReply({
        bundle,
        to,
        subject: params.title,
        text: `${params.body}\n\n— ${params.tenantName}`,
      });
      emails++;
    } catch (e) {
      errors.push(`email ${uid}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { notifications, emails, errors };
}

export async function runExpiryCronCheck(
  admin: SupabaseClient
): Promise<ExpiryCronResult> {
  const calendarDate = todayUtcDateString();
  const taskAlert = taskAlertDaysBefore();
  const errors: string[] = [];
  let documentsApproaching = 0;
  let documentsOverdue = 0;
  let tasksApproaching = 0;
  let tasksOverdue = 0;
  let notificationsInserted = 0;
  let emailsSent = 0;
  let skippedDedupe = 0;

  const { data: tenants } = await admin.from("tenants").select("id, name");
  const tenantName = (id: string) =>
    tenants?.find((t) => t.id === id)?.name ?? "شركة";

  const { data: docs, error: dErr } = await admin
    .from("company_documents")
    .select("id, tenant_id, document_name, expiry_date, alert_days_before");
  if (dErr) throw new Error(dErr.message);

  for (const d of docs ?? []) {
    const id = d.id as string;
    const tenant_id = d.tenant_id as string;
    const document_name = String(d.document_name);
    const expiry_date = String(d.expiry_date);
    const alert_days_before = Number(d.alert_days_before);
    const days = documentDaysUntilExpiry(expiry_date, calendarDate);

    const kinds: ("approaching" | "overdue")[] = [];
    if (days < 0) kinds.push("overdue");
    else if (days <= alert_days_before) kinds.push("approaching");

    for (const alert_kind of kinds) {
      const inserted = await tryInsertDedupe(admin, {
        source_type: "company_document",
        source_id: id,
        alert_kind,
        calendar_date: calendarDate,
      });
      if (!inserted) {
        skippedDedupe++;
        continue;
      }
      if (alert_kind === "approaching") documentsApproaching++;
      else documentsOverdue++;

      const tname = tenantName(tenant_id);
      const title =
        alert_kind === "overdue"
          ? `مستند منتهي: ${document_name}`
          : `تنبيه انتهاء مستند: ${document_name}`;
      const body =
        alert_kind === "overdue"
          ? `المستند «${document_name}» لدى ${tname} انتهى بتاريخ ${expiry_date}.`
          : `المستند «${document_name}» لدى ${tname} ينتهي في ${expiry_date} (خلال ${days} يوماً).`;

      try {
        const r = await notifyRecipients({
          admin,
          tenantId: tenant_id,
          tenantName: tname,
          title,
          body,
          payload: {
            kind: alert_kind,
            source_type: "company_document",
            source_id: id,
            tenant_id,
            expiry_date,
          },
        });
        notificationsInserted += r.notifications;
        emailsSent += r.emails;
        errors.push(...r.errors);
      } catch (e) {
        errors.push(
          `document ${id} ${alert_kind}: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }
  }

  const { data: tasks, error: tErr } = await admin
    .from("corporate_tasks")
    .select("id, tenant_id, title, display_number, due_on, status")
    .in("status", ["not_started", "in_progress", "on_hold"]);
  if (tErr) throw new Error(tErr.message);

  for (const task of tasks ?? []) {
    const id = task.id as string;
    const tenant_id = task.tenant_id as string;
    const titleTask = String(task.title);
    const due_on = String(task.due_on);
    const display_number = Number(task.display_number);
    const days = documentDaysUntilExpiry(due_on, calendarDate);

    const kinds: ("approaching" | "overdue")[] = [];
    if (days < 0) kinds.push("overdue");
    else if (days <= taskAlert) kinds.push("approaching");

    for (const alert_kind of kinds) {
      const inserted = await tryInsertDedupe(admin, {
        source_type: "corporate_task",
        source_id: id,
        alert_kind,
        calendar_date: calendarDate,
      });
      if (!inserted) {
        skippedDedupe++;
        continue;
      }
      if (alert_kind === "approaching") tasksApproaching++;
      else tasksOverdue++;

      const tname = tenantName(tenant_id);
      const title =
        alert_kind === "overdue"
          ? `مهمة متأخرة #${display_number}`
          : `تنبيه استحقاق مهمة #${display_number}`;
      const body =
        alert_kind === "overdue"
          ? `المهمة «${titleTask}» (#${display_number}) لدى ${tname} تجاوزت تاريخ الانتهاء ${due_on}.`
          : `المهمة «${titleTask}» (#${display_number}) لدى ${tname} تستحق في ${due_on} (خلال ${days} يوماً).`;

      try {
        const r = await notifyRecipients({
          admin,
          tenantId: tenant_id,
          tenantName: tname,
          title,
          body,
          payload: {
            kind: alert_kind,
            source_type: "corporate_task",
            source_id: id,
            tenant_id,
            due_on,
            display_number,
          },
        });
        notificationsInserted += r.notifications;
        emailsSent += r.emails;
        errors.push(...r.errors);
      } catch (e) {
        errors.push(
          `task ${id} ${alert_kind}: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }
  }

  return {
    ok: true,
    calendarDate,
    documentsApproaching,
    documentsOverdue,
    tasksApproaching,
    tasksOverdue,
    notificationsInserted,
    emailsSent,
    skippedDedupe,
    errors,
  };
}
