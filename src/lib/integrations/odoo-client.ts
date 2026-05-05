import "server-only";

import { decryptCredentialSecret } from "@/lib/crypto/credentials-cipher";
import {
  defaultOpenTaskDomain,
  odooAuthenticate,
  odooListDatabases,
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
  return bundle.databaseName?.trim() ?? "";
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

async function discoverDatabaseFromLoginPage(baseUrl: string): Promise<string | null> {
  // #region agent log
  fetch('http://127.0.0.1:7521/ingest/be47065e-d94d-4ea9-ba05-564706e1b09a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bbe53c'},body:JSON.stringify({sessionId:'bbe53c',runId:'pre-fix',hypothesisId:'H1',location:'odoo-client.ts:discoverDatabaseFromLoginPage:start',message:'login page db discovery started',data:{baseUrl},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  try {
    const url = `${baseUrl}/web/login`;
    const res = await fetch(url, { method: "GET", cache: "no-store" });
    if (!res.ok) return null;
    const html = await res.text();
    // #region agent log
    fetch('http://127.0.0.1:7521/ingest/be47065e-d94d-4ea9-ba05-564706e1b09a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bbe53c'},body:JSON.stringify({sessionId:'bbe53c',runId:'pre-fix',hypothesisId:'H1',location:'odoo-client.ts:discoverDatabaseFromLoginPage:response',message:'login page fetched',data:{ok:res.ok,status:res.status,hasHtml:Boolean(html)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (!html) return null;

    // Odoo often embeds current db in a hidden login input.
    const hiddenDb =
      html.match(/name=["']db["'][^>]*value=["']([^"']+)["']/i)?.[1] ??
      html.match(/value=["']([^"']+)["'][^>]*name=["']db["']/i)?.[1] ??
      null;
    if (hiddenDb && hiddenDb.trim()) return hiddenDb.trim();

    // Some bundles expose current DB in boot payload.
    const jsDb =
      html.match(/["']db["']\s*:\s*["']([^"']+)["']/i)?.[1] ??
      html.match(/odoo\.db\s*=\s*["']([^"']+)["']/i)?.[1] ??
      null;
    if (jsDb && jsDb.trim()) return jsDb.trim();
    return null;
  } catch {
    return null;
  }
}

async function authenticateViaWebSession(params: {
  baseUrl: string;
  login: string;
  password: string;
  preferredDatabase: string;
}): Promise<{ uid: number; database: string }> {
  const dbCandidates = candidateDatabases(params.baseUrl, params.preferredDatabase);
  // #region agent log
  fetch('http://127.0.0.1:7521/ingest/be47065e-d94d-4ea9-ba05-564706e1b09a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bbe53c'},body:JSON.stringify({sessionId:'bbe53c',runId:'pre-fix',hypothesisId:'H2',location:'odoo-client.ts:authenticateViaWebSession:start',message:'web session auth started',data:{baseUrl:params.baseUrl,login:params.login,candidateCount:dbCandidates.length},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  // On some Odoo deployments, sending empty db can auto-resolve mono-db.
  const ordered = ["", ...dbCandidates].filter((v, i, arr) => arr.indexOf(v) === i);
  let lastErr = "Unknown Odoo web auth error";

  for (const db of ordered) {
    try {
      const res = await fetch(`${params.baseUrl}/web/session/authenticate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "call",
          params: {
            db,
            login: params.login,
            password: params.password,
          },
          id: Date.now(),
        }),
      });

      const raw = await res.text();
      const payload = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      const result =
        payload && typeof payload === "object" && payload.result && typeof payload.result === "object"
          ? (payload.result as Record<string, unknown>)
          : null;
      const uid = Number(result?.uid ?? 0);
      const dbName =
        typeof result?.db === "string" && result.db.trim()
          ? result.db.trim()
          : typeof result?.db_name === "string" && result.db_name.trim()
            ? result.db_name.trim()
            : db.trim();

      if (uid > 0 && dbName) {
        // #region agent log
        fetch('http://127.0.0.1:7521/ingest/be47065e-d94d-4ea9-ba05-564706e1b09a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bbe53c'},body:JSON.stringify({sessionId:'bbe53c',runId:'pre-fix',hypothesisId:'H2',location:'odoo-client.ts:authenticateViaWebSession:success',message:'web session auth succeeded',data:{db:dbName,uid},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        return { uid, database: dbName };
      }

      const errObj =
        payload && typeof payload === "object" && payload.error && typeof payload.error === "object"
          ? (payload.error as Record<string, unknown>)
          : null;
      const errMsg =
        typeof errObj?.message === "string"
          ? errObj.message
          : typeof errObj?.data === "object" && errObj?.data && "message" in errObj.data
            ? String((errObj.data as Record<string, unknown>).message ?? "")
            : `web auth failed (db='${db}')`;
      lastErr = errMsg;
      // #region agent log
      fetch('http://127.0.0.1:7521/ingest/be47065e-d94d-4ea9-ba05-564706e1b09a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bbe53c'},body:JSON.stringify({sessionId:'bbe53c',runId:'pre-fix',hypothesisId:'H2',location:'odoo-client.ts:authenticateViaWebSession:attemptFail',message:'web session attempt failed',data:{db,status:res.status,errorMessage:lastErr.slice(0,180)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      // #region agent log
      fetch('http://127.0.0.1:7521/ingest/be47065e-d94d-4ea9-ba05-564706e1b09a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bbe53c'},body:JSON.stringify({sessionId:'bbe53c',runId:'pre-fix',hypothesisId:'H2',location:'odoo-client.ts:authenticateViaWebSession:exception',message:'web session exception',data:{db,errorMessage:lastErr.slice(0,180)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
    }
  }

  throw new Error(lastErr);
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
  if (msg.includes("odoo server error")) {
    return "Odoo Server Error: تعذر تسجيل الدخول من الخادم. إذا كان حساب Odoo Online يستخدم حماية إضافية/2FA فأنشئ API Key من Odoo واستخدمه بدل كلمة المرور.";
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
  // #region agent log
  fetch('http://127.0.0.1:7521/ingest/be47065e-d94d-4ea9-ba05-564706e1b09a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bbe53c'},body:JSON.stringify({sessionId:'bbe53c',runId:'pre-fix',hypothesisId:'H3',location:'odoo-client.ts:authenticateWithFallback:start',message:'auth fallback started',data:{baseUrl:params.baseUrl,login:params.login,preferredDb:params.preferredDatabase,initialAttempts:attempts},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  try {
    const loginPageDb = await withTimeout(
      discoverDatabaseFromLoginPage(params.baseUrl),
      Math.min(ODOO_CALL_TIMEOUT_MS, 4_000),
      "odoo_login_db_discovery"
    );
    if (loginPageDb && !attempts.includes(loginPageDb)) {
      attempts.unshift(loginPageDb);
    }
  } catch {
    // Continue with heuristics.
  }
  try {
    const discovered = await withTimeout(
      odooListDatabases(params.baseUrl),
      Math.min(ODOO_CALL_TIMEOUT_MS, 4_000),
      "odoo_db_list"
    );
    for (const db of discovered) {
      if (!attempts.includes(db)) attempts.push(db);
    }
  } catch {
    // DB listing may be disabled on hosted Odoo; continue with heuristic candidates.
  }
  let lastErr = "Unknown Odoo authentication error";
  let sawDbError = false;
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
      const lowered = msg.toLowerCase();
      if (lowered.includes("database") || lowered.includes("keyerror")) {
        sawDbError = true;
      }
      // Don't keep trying DB candidates when credentials are wrong.
      const human = humanizeOdooError(msg);
      if (human.startsWith("Invalid Password")) {
        // #region agent log
        fetch('http://127.0.0.1:7521/ingest/be47065e-d94d-4ea9-ba05-564706e1b09a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bbe53c'},body:JSON.stringify({sessionId:'bbe53c',runId:'pre-fix',hypothesisId:'H3',location:'odoo-client.ts:authenticateWithFallback:invalidPassword',message:'auth failed as invalid password',data:{db,errorMessage:msg.slice(0,180)},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        throw new Error(human);
      }
    }
  }

  if (sawDbError) {
    try {
      const viaWeb = await withTimeout(
        authenticateViaWebSession({
          baseUrl: params.baseUrl,
          login: params.login,
          password: params.password,
          preferredDatabase: params.preferredDatabase,
        }),
        ODOO_CALL_TIMEOUT_MS,
        "odoo_web_auth"
      );
      return viaWeb;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  // #region agent log
  fetch('http://127.0.0.1:7521/ingest/be47065e-d94d-4ea9-ba05-564706e1b09a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bbe53c'},body:JSON.stringify({sessionId:'bbe53c',runId:'pre-fix',hypothesisId:'H3',location:'odoo-client.ts:authenticateWithFallback:finalFail',message:'auth fallback failed',data:{sawDbError,lastErr:lastErr.slice(0,220)},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

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
    await authenticateWithFallback({
      baseUrl,
      preferredDatabase: db,
      login: params.loginUsername.trim(),
      password: params.passwordPlain,
    });
    // #region agent log
    fetch('http://127.0.0.1:7521/ingest/be47065e-d94d-4ea9-ba05-564706e1b09a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bbe53c'},body:JSON.stringify({sessionId:'bbe53c',runId:'pre-fix',hypothesisId:'H4',location:'odoo-client.ts:testOdooLoginPlain:success',message:'test odoo login plain succeeded',data:{baseUrl,login:params.loginUsername.trim()},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // #region agent log
    fetch('http://127.0.0.1:7521/ingest/be47065e-d94d-4ea9-ba05-564706e1b09a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bbe53c'},body:JSON.stringify({sessionId:'bbe53c',runId:'pre-fix',hypothesisId:'H4',location:'odoo-client.ts:testOdooLoginPlain:failure',message:'test odoo login plain failed',data:{rawMessage:msg.slice(0,220),humanized:humanizeOdooError(msg)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
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
    const preferredDatabase = resolveDatabase(params.bundle);
    const baseUrl = sanitizeOdooBaseUrl(params.bundle.baseUrl);
    const { database } = await authenticateWithFallback({
      baseUrl,
      preferredDatabase,
      login: params.bundle.username.trim(),
      password,
    });
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
