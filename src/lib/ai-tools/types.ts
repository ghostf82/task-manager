import type { SupabaseClient } from "@supabase/supabase-js";

import type { InboundEmailSummary } from "@/lib/integrations/email-client";
import type { OdooTaskRecord } from "@/lib/integrations/odoo-xmlrpc";

/** Errors surfaced to activity log during inbound collection. */
export type InboundScanErrorKind = "scan_odoo_error" | "scan_email_error";

export type InboundScanContribution = {
  tasks?: OdooTaskRecord[];
  emails?: InboundEmailSummary[];
  scanErrors?: { kind: InboundScanErrorKind; message: string }[];
};

export type AiToolCredential =
  | "none"
  | "imap_smtp"
  | "odoo"
  | "google_calendar"
  | "storage_upload";

/**
 * Pluggable AI tool: implement collectInbound only; registry wires scan & governance UI.
 */
export type AIToolModule = {
  slug: string;
  displayNameAr: string;
  displayNameEn: string;
  descriptionAr: string;
  /** English blurb for unified LLM / docs */
  descriptionEn?: string;
  /** Credentials required for full functionality */
  requiredCredentials?: AiToolCredential[];
  /** Logical operations exposed by this module (documentation / planning). */
  functions?: string[];
  /** Pulls data for inbound LLM scan (no UI). */
  collectInbound: (
    supabase: SupabaseClient,
    userId: string
  ) => Promise<InboundScanContribution>;
};
