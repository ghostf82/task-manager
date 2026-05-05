import "server-only";

import { decryptCredentialSecret } from "@/lib/crypto/credentials-cipher";
import {
  defaultOpenTaskDomain,
  odooAuthenticate,
  odooReadOne,
  odooSearchRead,
  sanitizeOdooBaseUrl,
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
const ODOO_CALL_TIMEOUT_MS = Number(process.env.ODOO_CALL_TIMEOUT_MS || 8_000);
const ODOO_SETTINGS_HINT =
  "تحقق من إعدادات Odoo في صفحة الإعدادات > التكاملات.";

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

function candidateDatabases(baseUrl: string, preferred: string): string[] {
  const out: string[] = [];
  const push = (v: string) => {
    const t = v.trim();
    if (!t) return;
    if (!out.includes(t)) out.push(t);
  };
  push(preferred);
  push(process.env.ODOO_DATABASE_NAME ?? "");
  push("production");
  try {
    const u = new URL(baseUrl);
    const hostFirst = u.hostname.split(".")[0] ?? "";
    push(hostFirst);
  } catch {
    // ignore malformed URL here; validator will handle later
  }
  return out;
}

function humanizeOdooError(raw: string): string {
  const msg = raw.toLowerCase();
  if (
    msg.includes("access denied") ||
    msg.includes("wrong login/password") ||
    msg.includes("authentication failed") ||
    msg.includes("odoo_auth") ||
    msg.includes("login failed")
  ) {
    return "Invalid Password: The Odoo password or username is incorrect.";
  }
  if (msg.includes("keyerror") && msg.includes("database_name")) {
    return "Database Name Error: Please verify the exact Odoo Database Name from your Odoo login screen.";
  }
  if (msg.includes("database") && msg.includes("does not exist")) {
    return "Database Name Error: Please verify the exact Odoo Database Name from your Odoo login screen.";
  }
  if (msg.includes("<title>") || msg.includes("title tag") || msg.includes("html")) {
    return "Base URL Error: Use only the root Odoo URL (for example: https://your-domain.odoo.com) without /odoo or /web.";
  }
  if (msg.includes("timeout")) {
    return `تعذّر الاتصال بـ Odoo خلال المهلة. ${ODOO_SETTINGS_HINT}`;
  }
  return `تعذر الاتصال بـ Odoo: ${raw}`;
}

async function authenticateWithFallback(params: {
  baseUrl: string;
  preferredDatabase: string;
  login: string;
  password: string;
}): Promise<{ uid: number; database: string }> {
  const attempts = candidateDatabases(params.baseUrl, params.preferredDatabase);
  let lastErr = "Unknown Odoo authentication error";
  for (const db of attempts) {
    try {
      const uid = await withTimeout(
        odooAuthenticate({
          baseUrl: params.baseUrl,
          database: db,
          login: params.login,
          password: params.password,
        }),
        ODOO_CALL_TIMEOUT_MS,
        "odoo_auth"
      );
      return { uid, database: db };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      lastErr = msg;
      // Don't keep trying DB candidates when credentials are wrong.
      const human = humanizeOdooError(msg);
      if (human.startsWith("Invalid Password")) {
        throw new Error(human);
      }
    }
  }
  throw new Error(lastErr);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timeout after ${timeoutMs}ms`)), timeoutMs);
    });
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function fetchOdooOpenTasksForUser(
  bundle: OdooCredentialBundle
): Promise<{ tasks: OdooTaskRecord[]; error?: string }> {
  try {
    const password = decryptCredentialSecret(bundle.passwordEncrypted);
    const preferredDatabase = resolveDatabase(bundle);
    const baseUrl = sanitizeOdooBaseUrl(bundle.baseUrl);
    const { uid, database } = await authenticateWithFallback({
      baseUrl,
      preferredDatabase,
      login: bundle.username.trim(),
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
    const rows = await withTimeout(
      odooSearchRead<OdooTaskRecord>({
        baseUrl,
        database,
        uid,
        password,
        model: TASK_MODEL,
        domain,
        fields: [...TASK_FIELDS],
        limit: 60,
      }),
      ODOO_CALL_TIMEOUT_MS,
      "odoo_search_read"
    );

    const tasks = rows.map((r) => ({
      ...r,
      id: Number(r.id),
      user_ids: Array.isArray(r.user_ids) ? r.user_ids.map(Number) : [],
    }));

    return { tasks };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { tasks: [], error: humanizeOdooError(msg) };
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
    const baseUrl = sanitizeOdooBaseUrl(params.baseUrl);
    const db = params.databaseName.trim();
    if (!db) {
      return {
        ok: false,
        message:
          "Database Name Error: Please verify the exact Odoo Database Name from your Odoo login screen.",
      };
    }
    await authenticateWithFallback({
      baseUrl,
      preferredDatabase: db,
      login: params.loginUsername.trim(),
      password: params.passwordPlain,
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: humanizeOdooError(msg) };
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
    const preferredDatabase = resolveDatabase(params.bundle);
    const baseUrl = sanitizeOdooBaseUrl(params.bundle.baseUrl);
    const { uid, database } = await authenticateWithFallback({
      baseUrl,
      preferredDatabase,
      login: params.bundle.username.trim(),
      password,
    });
    const ok = await withTimeout(
      odooWrite({
        baseUrl,
        database,
        uid,
        password,
        model: TASK_MODEL,
        ids: [params.taskId],
        values: { stage_id: params.stageId },
      }),
      ODOO_CALL_TIMEOUT_MS,
      "odoo_write"
    );
    if (!ok) {
      return { ok: false, error: "رفض Odoo عملية التحديث." };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: humanizeOdooError(msg) };
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
    const baseUrl = sanitizeOdooBaseUrl(params.bundle.baseUrl);
    const row = await withTimeout(
      odooReadOne({
        baseUrl,
        database,
        uid: params.odooUid,
        password,
        model: TASK_MODEL,
        id: params.taskId,
        fields: ["user_ids", "user_id"],
      }),
      ODOO_CALL_TIMEOUT_MS,
      "odoo_read_one"
    );
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
  const preferredDatabase = resolveDatabase(bundle);
  const baseUrl = sanitizeOdooBaseUrl(bundle.baseUrl);
  const { uid } = await authenticateWithFallback({
    baseUrl,
    preferredDatabase,
    login: bundle.username.trim(),
    password,
  });
  return uid;
}
