import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { OdooCredentialBundle } from "@/lib/integrations/odoo-client";
import type { EmailCredentialBundle } from "@/lib/integrations/email-client";
import { sanitizeOdooBaseUrl } from "@/lib/integrations/odoo-xmlrpc";

const ODOO_SETTINGS_HINT =
  "تحقق من ربط Odoo في صفحة الإعدادات > التكاملات (/dashboard/settings/integrations).";

function normalizeBaseUrl(url: string): string {
  const v = sanitizeOdooBaseUrl(url.trim());
  if (!v) return "";
  return v.endsWith("/") ? v.slice(0, -1) : v;
}

export async function loadOdooCredentialBundle(
  supabase: SupabaseClient,
  userId: string
): Promise<OdooCredentialBundle | null> {
  const { data } = await supabase
    .from("user_odoo_credentials")
    .select("base_url, database_name, login_username, password_encrypted")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  const baseUrl = normalizeBaseUrl(String(data.base_url ?? ""));
  const databaseName = String(data.database_name ?? "").trim();
  const username = String(data.login_username ?? "").trim();
  const passwordEncrypted = String(data.password_encrypted ?? "").trim();
  if (!baseUrl || !username || !passwordEncrypted) {
    return null;
  }
  return {
    baseUrl,
    databaseName,
    username,
    passwordEncrypted,
  };
}

export function odooCredentialsMissingMessage(): string {
  return `بيانات ربط Odoo غير مكتملة أو غير محفوظة. ${ODOO_SETTINGS_HINT}`;
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
