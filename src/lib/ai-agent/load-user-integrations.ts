import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { OdooCredentialBundle } from "@/lib/integrations/odoo-client";
import type { EmailCredentialBundle } from "@/lib/integrations/email-client";
import {
  databaseNameForMode,
  loadCompanyOdooSettings,
  resolveEffectiveOdooBaseUrl,
  resolveEffectiveOdooConnectionMode,
} from "@/lib/integrations/company-odoo-settings";

const ODOO_SETTINGS_HINT =
  "تحقق من ربط Odoo في صفحة الإعدادات > التكاملات (/dashboard/settings/integrations).";
export const ODOO_BROWSER_MODE_DB = "__browser_session__";
type OdooConnectionMode = "none" | "api" | "browser_session";

async function readUserCredentialRow(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from("user_odoo_credentials")
    .select("base_url, database_name, login_username, password_encrypted")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

export async function loadOdooCredentialBundle(
  supabase: SupabaseClient,
  userId: string
): Promise<OdooCredentialBundle | null> {
  const data = await readUserCredentialRow(supabase, userId);
  if (!data) return null;

  const { mode } = await resolveEffectiveOdooConnectionMode(supabase, userId);
  if (mode !== "api") return null;

  const baseUrl = await resolveEffectiveOdooBaseUrl(supabase, userId);
  const company = await loadCompanyOdooSettings(supabase);
  const storedDb = String(data.database_name ?? "").trim();
  const databaseName =
    company.apiDatabaseName ||
    (storedDb !== ODOO_BROWSER_MODE_DB ? storedDb : "");
  const username = String(data.login_username ?? "").trim();
  const passwordEncrypted = String(data.password_encrypted ?? "").trim();

  if (!baseUrl || !databaseName || !username || !passwordEncrypted) {
    return null;
  }
  return {
    baseUrl,
    databaseName,
    username,
    passwordEncrypted,
  };
}

export async function loadOdooConnectionState(
  supabase: SupabaseClient,
  userId: string
): Promise<{ mode: OdooConnectionMode; baseUrl: string }> {
  return resolveEffectiveOdooConnectionMode(supabase, userId);
}

export async function loadOdooBrowserSessionBundle(
  supabase: SupabaseClient,
  userId: string
): Promise<OdooCredentialBundle | null> {
  const data = await readUserCredentialRow(supabase, userId);
  if (!data) return null;

  const { mode } = await resolveEffectiveOdooConnectionMode(supabase, userId);
  if (mode !== "browser_session") return null;

  const baseUrl = await resolveEffectiveOdooBaseUrl(supabase, userId);
  const username = String(data.login_username ?? "").trim();
  const passwordEncrypted = String(data.password_encrypted ?? "").trim();

  if (!baseUrl || !username || !passwordEncrypted) {
    return null;
  }
  return {
    baseUrl,
    databaseName: ODOO_BROWSER_MODE_DB,
    username,
    passwordEncrypted,
  };
}

export function odooCredentialsMissingMessage(): string {
  return `بيانات ربط Odoo غير مكتملة أو غير محفوظة. ${ODOO_SETTINGS_HINT}`;
}

export function odooGlobalUrlMissingMessage(): string {
  return "لم يضبط مسؤول النظام رابط Odoo للشركة بعد. تواصل مع الإدارة لإكمال الإعداد.";
}

/** Resolve database_name value to store on user_odoo_credentials for the current company mode. */
export async function resolveStoredOdooDatabaseName(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const company = await loadCompanyOdooSettings(supabase);
  if (company.baseUrl) {
    return databaseNameForMode(company.connectionMode, company.apiDatabaseName);
  }
  const data = await readUserCredentialRow(supabase, userId);
  const stored = String(data?.database_name ?? "").trim();
  if (stored) return stored;
  return ODOO_BROWSER_MODE_DB;
}

export async function loadEmailCredentialBundle(
  supabase: SupabaseClient,
  userId: string
): Promise<EmailCredentialBundle | null> {
  const { data } = await supabase
    .from("user_email_credentials")
    .select(
      "imap_host, imap_port, imap_use_tls, imap_username, imap_password_encrypted, smtp_host, smtp_port, smtp_use_tls, smtp_username, smtp_password_encrypted"
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    imapHost: data.imap_host,
    imapPort: data.imap_port,
    imapUseTls: data.imap_use_tls,
    imapUsername: data.imap_username,
    imapPasswordEncrypted: data.imap_password_encrypted,
    smtpHost: data.smtp_host,
    smtpPort: data.smtp_port,
    smtpUseTls: data.smtp_use_tls,
    smtpUsername: data.smtp_username,
    smtpPasswordEncrypted: data.smtp_password_encrypted,
  };
}
