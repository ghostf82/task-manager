import "server-only";

import imaps from "imap-simple";
import nodemailer from "nodemailer";

import { decryptCredentialSecret } from "@/lib/crypto/credentials-cipher";

export type EmailCredentialBundle = {
  imapHost: string;
  imapPort: number;
  imapUseTls: boolean;
  imapUsername: string;
  imapPasswordEncrypted: string;
  smtpHost: string;
  smtpPort: number;
  smtpUseTls: boolean;
  smtpUsername: string;
  smtpPasswordEncrypted: string;
};

export type InboundEmailSummary = {
  uid: number;
  subject: string;
  from: string;
  replyTo: string;
  date: string;
  messageId: string;
  textPreview: string;
};

function formatAddress(
  addr: { name?: string; mailbox?: string; host?: string } | undefined
): string {
  if (!addr?.mailbox || !addr?.host) return "";
  return `${addr.mailbox}@${addr.host}`.toLowerCase();
}

function envelopeFromList(
  list: { name?: string; mailbox?: string; host?: string }[] | undefined
): string {
  if (!list?.length) return "";
  return formatAddress(list[0]);
}

export async function fetchUnreadInboxSummary(
  bundle: EmailCredentialBundle,
  limit = 30
): Promise<{ messages: InboundEmailSummary[]; error?: string }> {
  let connection: imaps.ImapSimple | undefined;
  try {
    const imapPassword = decryptCredentialSecret(bundle.imapPasswordEncrypted);
    connection = await imaps.connect({
      imap: {
        user: bundle.imapUsername,
        password: imapPassword,
        host: bundle.imapHost,
        port: bundle.imapPort,
        tls: bundle.imapUseTls,
        authTimeout: 20000,
        tlsOptions: { servername: bundle.imapHost },
      },
    });

    await connection.openBox("INBOX");

    const searchCriteria = ["UNSEEN"];
    const fetchOptions = {
      bodies: [] as string[],
      struct: true,
      markSeen: false,
    };

    const messages = await connection.search(searchCriteria, fetchOptions);
    const out: InboundEmailSummary[] = [];

    for (const msg of messages.slice(0, limit)) {
      const attrs = msg.attributes as unknown as {
        uid?: number;
        envelope?: {
          subject?: string;
          from?: { mailbox?: string; host?: string; name?: string }[];
          date?: Date | string;
          messageId?: string;
        };
      };
      const uid = typeof attrs.uid === "number" ? attrs.uid : undefined;
      const env = attrs.envelope;
      if (uid === undefined || !env) continue;

      const from = envelopeFromList(env.from);
      const subject = env.subject ? String(env.subject) : "(بدون عنوان)";
      const messageId = env.messageId ? String(env.messageId).trim() : "";
      let dateIso = new Date().toISOString();
      if (env.date instanceof Date) {
        dateIso = env.date.toISOString();
      } else if (typeof env.date === "string" && env.date) {
        const d = new Date(env.date);
        if (!Number.isNaN(d.getTime())) {
          dateIso = d.toISOString();
        }
      }

      out.push({
        uid,
        subject,
        from,
        replyTo: from,
        date: dateIso,
        messageId,
        textPreview: "",
      });
    }

    return { messages: out };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { messages: [], error: `فشل IMAP: ${msg}` };
  } finally {
    if (connection) {
      try {
        connection.end();
      } catch {
        /* ignore */
      }
    }
  }
}

export async function sendSmtpReply(params: {
  bundle: EmailCredentialBundle;
  to: string;
  subject: string;
  text: string;
  inReplyTo?: string | null;
  references?: string | null;
}): Promise<void> {
  const smtpPass = decryptCredentialSecret(params.bundle.smtpPasswordEncrypted);
  const secure = params.bundle.smtpUseTls && params.bundle.smtpPort === 465;
  const transporter = nodemailer.createTransport({
    host: params.bundle.smtpHost,
    port: params.bundle.smtpPort,
    secure,
    auth: {
      user: params.bundle.smtpUsername,
      pass: smtpPass,
    },
    requireTLS: params.bundle.smtpUseTls && !secure,
  });

  const fromAddr =
    process.env.SMTP_FROM_EMAIL?.trim() ||
    (params.bundle.smtpUsername.includes("@")
      ? params.bundle.smtpUsername
      : params.bundle.imapUsername.includes("@")
        ? params.bundle.imapUsername
        : params.bundle.smtpUsername);

  await transporter.sendMail({
    from: fromAddr,
    to: params.to,
    subject: params.subject,
    text: params.text,
    headers: {
      ...(params.inReplyTo ? { "In-Reply-To": params.inReplyTo } : {}),
      ...(params.references ? { References: params.references } : {}),
    },
  });
}

/**
 * IMAP login + INBOX open (no search), then SMTP `verify()` — no message fetch.
 * Plaintext passwords for one-off test from server action over HTTPS.
 */
export async function testEmailConnectionsPlain(params: {
  imapHost: string;
  imapPort: number;
  imapUseTls: boolean;
  imapUsername: string;
  imapPassword: string;
  smtpHost: string;
  smtpPort: number;
  smtpUseTls: boolean;
  smtpUsername: string;
  smtpPassword: string;
}): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  let connection: Awaited<ReturnType<typeof imaps.connect>> | undefined;
  try {
    connection = await imaps.connect({
      imap: {
        user: params.imapUsername,
        password: params.imapPassword,
        host: params.imapHost.trim(),
        port: params.imapPort,
        tls: params.imapUseTls,
        authTimeout: 20000,
        tlsOptions: { servername: params.imapHost.trim() },
      },
    });
    await connection.openBox("INBOX");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `IMAP: ${msg}` };
  } finally {
    if (connection) {
      try {
        connection.end();
      } catch {
        /* ignore */
      }
    }
  }

  try {
    const secure = params.smtpUseTls && params.smtpPort === 465;
    const transporter = nodemailer.createTransport({
      host: params.smtpHost.trim(),
      port: params.smtpPort,
      secure,
      auth: {
        user: params.smtpUsername,
        pass: params.smtpPassword,
      },
      requireTLS: params.smtpUseTls && !secure,
    });
    await transporter.verify();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `SMTP: ${msg}` };
  }

  return {
    ok: true,
    message: "نجح الاتصال بـ IMAP (فتح صندوق الوارد) ونجح فحص SMTP (verify).",
  };
}

export async function emailCredentialProbe(bundle: EmailCredentialBundle): Promise<{
  ok: boolean;
  message: string;
}> {
  try {
    const imapPass = decryptCredentialSecret(bundle.imapPasswordEncrypted);
    const smtpPass = decryptCredentialSecret(bundle.smtpPasswordEncrypted);
    const r = await testEmailConnectionsPlain({
      imapHost: bundle.imapHost,
      imapPort: bundle.imapPort,
      imapUseTls: bundle.imapUseTls,
      imapUsername: bundle.imapUsername,
      imapPassword: imapPass,
      smtpHost: bundle.smtpHost,
      smtpPort: bundle.smtpPort,
      smtpUseTls: bundle.smtpUseTls,
      smtpUsername: bundle.smtpUsername,
      smtpPassword: smtpPass,
    });
    if (!r.ok) {
      return { ok: false, message: r.message };
    }
    return { ok: true, message: r.message };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg };
  }
}
