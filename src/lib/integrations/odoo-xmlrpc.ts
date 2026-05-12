import "server-only";

import * as xmlrpc from "xmlrpc";

export type OdooTaskRecord = {
  id: number;
  name: string;
  date_deadline: string | false;
  stage_id: [number, string] | false;
  user_ids: number[];
  user_id: [number, string] | false;
  project_id: [number, string] | false;
  description: string | false;
};

export function sanitizeOdooBaseUrl(raw: string): string {
  let t = raw.trim();
  t = t.replace(/\/+$/g, "");
  // Keep /odoo if the instance is hosted under that path.
  // Only strip trailing /web helper path.
  t = t.replace(/\/web$/i, "");
  // Collapse repeated "/odoo" suffixes (e.g. /odoo/odoo -> /odoo).
  t = t.replace(/(?:\/odoo)+$/i, "/odoo");
  return t;
}

function normalizeBaseUrl(raw: string): URL {
  const t = sanitizeOdooBaseUrl(raw);
  return new URL(t.endsWith("/") ? t : `${t}/`);
}

function createClient(baseUrl: string, pathSuffix: string): xmlrpc.Client {
  const u = normalizeBaseUrl(baseUrl);
  const isHttps = u.protocol === "https:";
  const port = u.port ? Number(u.port) : isHttps ? 443 : 80;
  let pathname = u.pathname || "/";
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }
  const path =
    pathname === "" || pathname === "/"
      ? `/xmlrpc/2/${pathSuffix}`
      : `${pathname}/xmlrpc/2/${pathSuffix}`.replace(/\/{2,}/g, "/");
  const opts = { host: u.hostname, port, path };
  return isHttps ? xmlrpc.createSecureClient(opts) : xmlrpc.createClient(opts);
}

function methodCall(client: xmlrpc.Client, method: string, params: unknown[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    client.methodCall(method, params, (err, value) => {
      if (err) reject(err);
      else resolve(value);
    });
  });
}

export async function odooAuthenticate(params: {
  baseUrl: string;
  database: string;
  login: string;
  password: string;
}): Promise<number> {
  const client = createClient(params.baseUrl, "common");
  const uid = await methodCall(client, "authenticate", [
    params.database,
    params.login,
    params.password,
    {},
  ]);
  if (uid === false || uid === 0 || typeof uid !== "number") {
    throw new Error("Invalid Password: The Odoo password or username is incorrect.");
  }
  return uid;
}

export async function odooListDatabases(baseUrl: string): Promise<string[]> {
  const client = createClient(baseUrl, "common");
  const rows = await methodCall(client, "list", []);
  if (!Array.isArray(rows)) return [];
  return rows.map((x) => String(x).trim()).filter(Boolean);
}

export async function odooSearchRead<T = unknown>(params: {
  baseUrl: string;
  database: string;
  uid: number;
  password: string;
  model: string;
  domain: unknown[];
  fields: string[];
  limit?: number;
}): Promise<T[]> {
  const client = createClient(params.baseUrl, "object");
  const rows = await methodCall(client, "execute_kw", [
    params.database,
    params.uid,
    params.password,
    params.model,
    "search_read",
    [params.domain],
    { fields: params.fields, limit: params.limit ?? 80 },
  ]);
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows as T[];
}

export async function odooWrite(params: {
  baseUrl: string;
  database: string;
  uid: number;
  password: string;
  model: string;
  ids: number[];
  values: Record<string, unknown>;
}): Promise<boolean> {
  const client = createClient(params.baseUrl, "object");
  const ok = await methodCall(client, "execute_kw", [
    params.database,
    params.uid,
    params.password,
    params.model,
    "write",
    [params.ids, params.values],
    {},
  ]);
  return Boolean(ok);
}

export async function odooReadOne(params: {
  baseUrl: string;
  database: string;
  uid: number;
  password: string;
  model: string;
  id: number;
  fields: string[];
}): Promise<Record<string, unknown> | null> {
  const client = createClient(params.baseUrl, "object");
  const rows = await methodCall(client, "execute_kw", [
    params.database,
    params.uid,
    params.password,
    params.model,
    "read",
    [[params.id]],
    { fields: params.fields },
  ]);
  if (Array.isArray(rows) && rows[0] && typeof rows[0] === "object") {
    return rows[0] as Record<string, unknown>;
  }
  return null;
}

/** Open (non-folded stage) tasks assigned to the Odoo session user. */
export function defaultOpenTaskDomain(odooUid: number): unknown[] {
  return [
    "&",
    "|",
    ["user_ids", "in", [odooUid]],
    ["user_id", "=", odooUid],
    "|",
    ["stage_id", "=", false],
    ["stage_id.fold", "=", false],
  ];
}

/**
 * Tasks assigned to this Odoo user (Many2many assignees or single responsible),
 * without filtering by stage fold — used when strict "open" stages return none
 * (misconfigured `fold`, custom stages, or databases where `stage_id.fold` is unreliable).
 */
export function assignedToUserDomain(odooUid: number): unknown[] {
  return ["|", ["user_ids", "in", [odooUid]], ["user_id", "=", odooUid]];
}

/**
 * Domain for inbound scan / open-task reads. Uses `ODOO_OPEN_TASK_DOMAIN_JSON` when set;
 * replace `__ODOO_UID__` in the JSON string with the numeric Odoo uid (avoids shipping a
 * static `[1]` domain from examples). Invalid JSON falls back to `defaultOpenTaskDomain`.
 */
export function resolveOpenTaskSearchDomain(odooUid: number): unknown[] {
  const raw = process.env.ODOO_OPEN_TASK_DOMAIN_JSON?.trim();
  if (!raw) {
    return defaultOpenTaskDomain(odooUid);
  }
  try {
    const replaced = raw.split("__ODOO_UID__").join(String(odooUid));
    const parsed = JSON.parse(replaced) as unknown;
    if (Array.isArray(parsed)) {
      return parsed as unknown[];
    }
  } catch {
    // ignore
  }
  return defaultOpenTaskDomain(odooUid);
}
