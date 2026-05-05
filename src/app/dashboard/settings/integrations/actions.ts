"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { decryptCredentialSecret, encryptCredentialSecret } from "@/lib/crypto/credentials-cipher";
import { appendAgentActivity } from "@/lib/ai-agent/activity-log";
import { userHasAiToolLicense } from "@/lib/ai-tools/user-licenses";
import { requireSession } from "@/lib/dashboard-auth";
import { tAction } from "@/lib/i18n/action-messages";
import { testEmailConnectionsPlain } from "@/lib/integrations/email-client";
import { testOdooLoginPlain } from "@/lib/integrations/odoo-client";
import { sanitizeOdooBaseUrl } from "@/lib/integrations/odoo-xmlrpc";
import { createClient } from "@/lib/supabase/server";

const ODOO_DEBUG_BUILD = "odoo-jsonrpc-debug-v2";
const ODOO_BROWSER_MODE_DB = "__browser_session__";
const ODOO_BROWSER_MODE_USER = "__browser_session__";
const ODOO_BROWSER_MODE_SECRET = "__browser_session__";

function num(v: FormDataEntryValue | null, fallback: number) {
  const n = Number(typeof v === "string" ? v.trim() : "");
  return Number.isFinite(n) ? n : fallback;
}

function bool(v: FormDataEntryValue | null) {
  return v === "on" || v === "true" || v === "1";
}

export async function saveOdooCredentialsAction(formData: FormData) {
  const session = await requireSession();
  const supabase = await createClient();

  const odooLicensed = await userHasAiToolLicense(supabase, session.id, "odoo");
  if (!odooLicensed) {
    redirect("/dashboard/settings/integrations?err=no_license_odoo");
  }

  const baseUrl = sanitizeOdooBaseUrl(String(formData.get("base_url") ?? "").trim());
  const browserMode = String(formData.get("connection_mode") ?? "").trim() === "browser_session";
  const databaseName = String(formData.get("database_name") ?? "").trim();
  const loginUsername = String(formData.get("login_username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!baseUrl || (!browserMode && !loginUsername)) {
    redirect("/dashboard/settings/integrations?err=odoo_fields");
  }

  const { data: existing } = await supabase
    .from("user_odoo_credentials")
    .select("password_encrypted")
    .eq("user_id", session.id)
    .maybeSingle();

  let passwordEncrypted: string;
  if (browserMode) {
    passwordEncrypted = encryptCredentialSecret(ODOO_BROWSER_MODE_SECRET);
  } else if (!password) {
    if (!existing?.password_encrypted) {
      redirect("/dashboard/settings/integrations?err=odoo_password");
    }
    passwordEncrypted = existing.password_encrypted;
  } else {
    try {
      passwordEncrypted = encryptCredentialSecret(password);
    } catch {
      redirect("/dashboard/settings/integrations?err=odoo_encrypt");
    }
  }

  const { error } = await supabase.from("user_odoo_credentials").upsert(
    {
      user_id: session.id,
      base_url: baseUrl,
      database_name: browserMode ? ODOO_BROWSER_MODE_DB : databaseName || null,
      login_username: browserMode ? ODOO_BROWSER_MODE_USER : loginUsername,
      password_encrypted: passwordEncrypted,
    },
    { onConflict: "user_id" }
  );

  if (error) {
    redirect("/dashboard/settings/integrations?err=odoo_save");
  }

  await appendAgentActivity(supabase, {
    userId: session.id,
    eventType: "vault",
    message: await tAction("integrationsActions.activityOdooSaved"),
  });

  revalidatePath("/dashboard/settings/integrations");
  revalidatePath("/dashboard/ai-agent");
  redirect("/dashboard/settings/integrations?saved=odoo");
}

export async function deleteOdooCredentialsAction() {
  const session = await requireSession();
  const supabase = await createClient();
  await supabase.from("user_odoo_credentials").delete().eq("user_id", session.id);
  await appendAgentActivity(supabase, {
    userId: session.id,
    eventType: "vault",
    message: await tAction("integrationsActions.activityOdooDeleted"),
  });
  revalidatePath("/dashboard/settings/integrations");
  revalidatePath("/dashboard/ai-agent");
  redirect("/dashboard/settings/integrations?saved=odoo_clear");
}

export async function saveEmailCredentialsAction(formData: FormData) {
  const session = await requireSession();
  const supabase = await createClient();

  const emailLicensed = await userHasAiToolLicense(supabase, session.id, "email");
  if (!emailLicensed) {
    redirect("/dashboard/settings/integrations?err=no_license_email");
  }

  const imapHost = String(formData.get("imap_host") ?? "").trim();
  const imapPort = num(formData.get("imap_port"), 993);
  const imapUseTls = bool(formData.get("imap_use_tls"));
  const imapUsername = String(formData.get("imap_username") ?? "").trim();
  const imapPassword = String(formData.get("imap_password") ?? "");

  const smtpHost = String(formData.get("smtp_host") ?? "").trim();
  const smtpPort = num(formData.get("smtp_port"), 465);
  const smtpUseTls = bool(formData.get("smtp_use_tls"));
  const smtpUsername = String(formData.get("smtp_username") ?? "").trim();
  const smtpPassword = String(formData.get("smtp_password") ?? "");

  if (!imapHost || !imapUsername || !smtpHost || !smtpUsername) {
    redirect("/dashboard/settings/integrations?err=email_fields");
  }

  const { data: existing } = await supabase
    .from("user_email_credentials")
    .select("imap_password_encrypted, smtp_password_encrypted")
    .eq("user_id", session.id)
    .maybeSingle();

  let imapEnc: string;
  let smtpEnc: string;

  try {
    if (!imapPassword) {
      if (!existing?.imap_password_encrypted) {
        redirect("/dashboard/settings/integrations?err=email_imap_password");
      }
      imapEnc = existing.imap_password_encrypted;
    } else {
      imapEnc = encryptCredentialSecret(imapPassword);
    }

    if (!smtpPassword) {
      if (!existing?.smtp_password_encrypted) {
        redirect("/dashboard/settings/integrations?err=email_smtp_password");
      }
      smtpEnc = existing.smtp_password_encrypted;
    } else {
      smtpEnc = encryptCredentialSecret(smtpPassword);
    }
  } catch {
    redirect("/dashboard/settings/integrations?err=email_encrypt");
  }

  const { error } = await supabase.from("user_email_credentials").upsert(
    {
      user_id: session.id,
      imap_host: imapHost,
      imap_port: imapPort,
      imap_use_tls: imapUseTls,
      imap_username: imapUsername,
      imap_password_encrypted: imapEnc,
      smtp_host: smtpHost,
      smtp_port: smtpPort,
      smtp_use_tls: smtpUseTls,
      smtp_username: smtpUsername,
      smtp_password_encrypted: smtpEnc,
    },
    { onConflict: "user_id" }
  );

  if (error) {
    redirect("/dashboard/settings/integrations?err=email_save");
  }

  await appendAgentActivity(supabase, {
    userId: session.id,
    eventType: "vault",
    message: await tAction("integrationsActions.activityEmailSaved"),
  });

  revalidatePath("/dashboard/settings/integrations");
  revalidatePath("/dashboard/ai-agent");
  redirect("/dashboard/settings/integrations?saved=email");
}

export async function deleteEmailCredentialsAction() {
  const session = await requireSession();
  const supabase = await createClient();
  await supabase.from("user_email_credentials").delete().eq("user_id", session.id);
  await appendAgentActivity(supabase, {
    userId: session.id,
    eventType: "vault",
    message: await tAction("integrationsActions.activityEmailDeleted"),
  });
  revalidatePath("/dashboard/settings/integrations");
  revalidatePath("/dashboard/ai-agent");
  redirect("/dashboard/settings/integrations?saved=email_clear");
}

export type ConnectionTestResult = { ok: boolean; message: string };

export async function testOdooConnectionAction(input: {
  base_url: string;
  database_name: string;
  login_username: string;
  password: string;
}): Promise<ConnectionTestResult> {
  const session = await requireSession();
  const supabase = await createClient();
  console.error("[odoo-debug] action start", {
    build: ODOO_DEBUG_BUILD,
    baseUrl: String(input.base_url ?? "").trim(),
    databaseName: String(input.database_name ?? "").trim(),
    loginUsername: String(input.login_username ?? "").trim(),
    hasPassword: Boolean(String(input.password ?? "").trim()),
  });

  if (String(input.database_name ?? "").trim() === ODOO_BROWSER_MODE_DB) {
    return {
      ok: true,
      message:
        "Browser Session Mode مفعل: سيتم الاعتماد على جلسة المتصفح بعد تسجيل دخولك في Odoo، وليس على اتصال API مباشر.",
    };
  }

  if (!(await userHasAiToolLicense(supabase, session.id, "odoo"))) {
    return { ok: false, message: await tAction("integrationsActions.testOdooNoLicense") };
  }

  let passwordPlain = String(input.password ?? "").trim();
  if (!passwordPlain) {
    const { data } = await supabase
      .from("user_odoo_credentials")
      .select("password_encrypted")
      .eq("user_id", session.id)
      .maybeSingle();
    if (!data?.password_encrypted) {
      return {
        ok: false,
        message: await tAction("integrationsActions.testOdooPasswordHint"),
      };
    }
    try {
      passwordPlain = decryptCredentialSecret(data.password_encrypted);
    } catch {
      return { ok: false, message: await tAction("integrationsActions.testOdooDecryptFail") };
    }
  }

  const r = await testOdooLoginPlain({
    baseUrl: sanitizeOdooBaseUrl(input.base_url.trim()),
    databaseName: String(input.database_name ?? "").trim(),
    loginUsername: input.login_username.trim(),
    passwordPlain,
  });
  console.error("[odoo-debug] action result", r);

  return r.ok
    ? { ok: true, message: await tAction("integrationsActions.testOdooSuccess") }
    : { ok: false, message: r.message };
}

export async function testEmailConnectionAction(input: {
  imap_host: string;
  imap_port: number;
  imap_use_tls: boolean;
  imap_username: string;
  imap_password: string;
  smtp_host: string;
  smtp_port: number;
  smtp_use_tls: boolean;
  smtp_username: string;
  smtp_password: string;
}): Promise<ConnectionTestResult> {
  const session = await requireSession();
  const supabase = await createClient();

  if (!(await userHasAiToolLicense(supabase, session.id, "email"))) {
    return { ok: false, message: await tAction("integrationsActions.testEmailNoLicense") };
  }

  let imapPass = String(input.imap_password ?? "").trim();
  let smtpPass = String(input.smtp_password ?? "").trim();

  if (!imapPass || !smtpPass) {
    const { data } = await supabase
      .from("user_email_credentials")
      .select("imap_password_encrypted, smtp_password_encrypted")
      .eq("user_id", session.id)
      .maybeSingle();
    try {
      if (!imapPass) {
        if (!data?.imap_password_encrypted) {
          return { ok: false, message: await tAction("integrationsActions.testImapPasswordHint") };
        }
        imapPass = decryptCredentialSecret(data.imap_password_encrypted);
      }
      if (!smtpPass) {
        if (!data?.smtp_password_encrypted) {
          return { ok: false, message: await tAction("integrationsActions.testSmtpPasswordHint") };
        }
        smtpPass = decryptCredentialSecret(data.smtp_password_encrypted);
      }
    } catch {
      return { ok: false, message: await tAction("integrationsActions.testEmailDecryptFail") };
    }
  }

  const r = await testEmailConnectionsPlain({
    imapHost: input.imap_host.trim(),
    imapPort: input.imap_port,
    imapUseTls: input.imap_use_tls,
    imapUsername: input.imap_username.trim(),
    imapPassword: imapPass,
    smtpHost: input.smtp_host.trim(),
    smtpPort: input.smtp_port,
    smtpUseTls: input.smtp_use_tls,
    smtpUsername: input.smtp_username.trim(),
    smtpPassword: smtpPass,
  });

  return r.ok ? { ok: true, message: r.message } : { ok: false, message: r.message };
}

