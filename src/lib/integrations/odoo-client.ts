import "server-only";

import { decryptCredentialSecret } from "@/lib/crypto/credentials-cipher";
import {
  defaultOpenTaskDomain,
  odooAuthenticate,
  odooReadOne,
  odooSearchRead,
  odooWrite,
  type OdooTaskRecord,
} from "@/lib/integrations/odoo-xmlrpc";

export type OdooCredentialBundle = {
  baseUrl: string;
  databaseName: string | null;
  username: string;
  passwordEncrypted: string;
};

const TASK_MODEL = process.env.ODOO_TASK_MODEL?.trim() || "project.task";

const TASK_FIELDS = [
  "id",
  "name",
  "date_deadline",
  "stage_id",
  "user_ids",
  "user_id",
  "project_id",
  "description",
] as const;

function resolveDatabase(bundle: OdooCredentialBundle): string {
  const db = bundle.databaseName?.trim();
  if (!db) {
    throw new Error(
      "اسم قاعدة بيانات Odoo غير محدد — أدخل قيمة «اسم قاعدة البيانات» في الخزنة."
    );
  }
  return db;
}

export async function fetchOdooOpenTasksForUser(
  bundle: OdooCredentialBundle
): Promise<{ tasks: OdooTaskRecord[]; error?: string }> {
  try {
    const password = decryptCredentialSecret(bundle.passwordEncrypted);
    const database = resolveDatabase(bundle);
    const uid = await odooAuthenticate({
      baseUrl: bundle.baseUrl,
      database,
      login: bundle.username,
      password,
    });
    const customDomain = process.env.ODOO_OPEN_TASK_DOMAIN_JSON?.trim();
    let domain: unknown[];
    if (customDomain) {
      try {
        const parsed = JSON.parse(customDomain) as unknown;
        domain = Array.isArray(parsed) ? (parsed as unknown[]) : defaultOpenTaskDomain(uid);
      } catch {
        domain = defaultOpenTaskDomain(uid);
      }
    } else {
      domain = defaultOpenTaskDomain(uid);
    }
    const rows = await odooSearchRead<OdooTaskRecord>({
      baseUrl: bundle.baseUrl,
      database,
      uid,
      password,
      model: TASK_MODEL,
      domain,
      fields: [...TASK_FIELDS],
      limit: 60,
    });

    const tasks = rows.map((r) => ({
      ...r,
      id: Number(r.id),
      user_ids: Array.isArray(r.user_ids) ? r.user_ids.map(Number) : [],
    }));

    return { tasks };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      msg.includes("FATAL") ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("ENOTFOUND")
    ) {
      return { tasks: [], error: `تعذّر الاتصال بخادم Odoo: ${msg}` };
    }
    return { tasks: [], error: msg };
  }
}

/** Lightweight auth check only (no task fetch). Used by «فحص الاتصال». */
export async function testOdooLoginPlain(params: {
  baseUrl: string;
  databaseName: string;
  loginUsername: string;
  passwordPlain: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const db = params.databaseName.trim();
    if (!db) {
      return { ok: false, message: "اسم قاعدة بيانات Odoo مطلوب للفحص." };
    }
    await odooAuthenticate({
      baseUrl: params.baseUrl.trim(),
      database: db,
      login: params.loginUsername.trim(),
      password: params.passwordPlain,
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg };
  }
}

export async function odooConnectionProbe(bundle: OdooCredentialBundle): Promise<{
  ok: boolean;
  message: string;
}> {
  const res = await fetchOdooOpenTasksForUser(bundle);
  if (res.error) {
    return { ok: false, message: res.error };
  }
  return {
    ok: true,
    message: `الاتصال ناجح. وُجدت ${res.tasks.length} مهمة مفتوحة مرتبطة بحسابك (نموذج ${TASK_MODEL}).`,
  };
}

export async function odooUpdateTaskStage(params: {
  bundle: OdooCredentialBundle;
  taskId: number;
  stageId: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const password = decryptCredentialSecret(params.bundle.passwordEncrypted);
    const database = resolveDatabase(params.bundle);
    const uid = await odooAuthenticate({
      baseUrl: params.bundle.baseUrl,
      database,
      login: params.bundle.username,
      password,
    });
    const ok = await odooWrite({
      baseUrl: params.bundle.baseUrl,
      database,
      uid,
      password,
      model: TASK_MODEL,
      ids: [params.taskId],
      values: { stage_id: params.stageId },
    });
    if (!ok) {
      return { ok: false, error: "رفض Odoo عملية التحديث." };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function odooVerifyTaskAssigned(params: {
  bundle: OdooCredentialBundle;
  taskId: number;
  odooUid: number;
}): Promise<boolean> {
  try {
    const password = decryptCredentialSecret(params.bundle.passwordEncrypted);
    const database = resolveDatabase(params.bundle);
    const row = await odooReadOne({
      baseUrl: params.bundle.baseUrl,
      database,
      uid: params.odooUid,
      password,
      model: TASK_MODEL,
      id: params.taskId,
      fields: ["user_ids", "user_id"],
    });
    if (!row) return false;
    const userIds = Array.isArray(row.user_ids) ? (row.user_ids as number[]) : [];
    const userId = row.user_id;
    const single =
      Array.isArray(userId) && typeof userId[0] === "number" ? userId[0] : false;
    if (userIds.includes(params.odooUid)) return true;
    if (single === params.odooUid) return true;
    return false;
  } catch {
    return false;
  }
}

export async function odooAuthenticateUid(bundle: OdooCredentialBundle): Promise<number> {
  const password = decryptCredentialSecret(bundle.passwordEncrypted);
  const database = resolveDatabase(bundle);
  return odooAuthenticate({
    baseUrl: bundle.baseUrl,
    database,
    login: bundle.username,
    password,
  });
}
