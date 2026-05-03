import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { OdooCredentialBundle } from "@/lib/integrations/odoo-client";
import type { EmailCredentialBundle } from "@/lib/integrations/email-client";

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
  return {
    baseUrl: data.base_url,
    databaseName: data.database_name,
    username: data.login_username,
    passwordEncrypted: data.password_encrypted,
  };
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
