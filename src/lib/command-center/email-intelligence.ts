import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadEmailCredentialBundle } from "@/lib/ai-agent/load-user-integrations";
import {
  fetchUnreadInboxSummary,
  type InboundEmailSummary,
} from "@/lib/integrations/email-client";

export type EmailPriority = "high" | "normal" | "low";

export type EmailIntelligenceRow = InboundEmailSummary & {
  priority: EmailPriority;
  ageHours: number;
  needsFollowUp: boolean;
};

export type EmailCommandMetrics = {
  connected: boolean;
  imapHost: string | null;
  mailboxUser: string | null;
  unreadTotal: number;
  highPriority: number;
  needsFollowUp: number;
  fetchedAt: string;
  error: string | null;
  messages: EmailIntelligenceRow[];
};

const URGENT_TOKENS = [
  "urgent",
  "asap",
  "important",
  "deadline",
  "action required",
  "reminder",
  "overdue",
  "عاجل",
  "فوري",
  "مهم",
  "مطلوب",
  "تذكير",
  "متأخر",
  "استحقاق",
];

export function scoreEmailPriority(msg: InboundEmailSummary): EmailPriority {
  const subject = String(msg.subject ?? "").toLowerCase();
  const preview = String(msg.textPreview ?? "").toLowerCase();
  const blob = `${subject} ${preview}`;
  if (URGENT_TOKENS.some((t) => blob.includes(t))) return "high";

  const ageMs = Date.now() - Date.parse(msg.date);
  if (Number.isFinite(ageMs) && ageMs > 72 * 60 * 60 * 1000) return "high";
  if (Number.isFinite(ageMs) && ageMs > 24 * 60 * 60 * 1000) return "normal";
  return "low";
}

export function enrichEmailRow(msg: InboundEmailSummary): EmailIntelligenceRow {
  const ageMs = Date.now() - Date.parse(msg.date);
  const ageHours = Number.isFinite(ageMs) ? Math.max(0, Math.round(ageMs / (60 * 60 * 1000))) : 0;
  const priority = scoreEmailPriority(msg);
  const needsFollowUp = priority === "high" || ageHours >= 48;
  return { ...msg, priority, ageHours, needsFollowUp };
}

export async function loadEmailCommandMetrics(
  supabase: SupabaseClient,
  userId: string,
  limit = 40
): Promise<EmailCommandMetrics> {
  const bundle = await loadEmailCredentialBundle(supabase, userId);
  if (!bundle) {
    return {
      connected: false,
      imapHost: null,
      mailboxUser: null,
      unreadTotal: 0,
      highPriority: 0,
      needsFollowUp: 0,
      fetchedAt: new Date().toISOString(),
      error: null,
      messages: [],
    };
  }

  const res = await fetchUnreadInboxSummary(bundle, limit);
  const messages = (res.messages ?? []).map(enrichEmailRow);
  messages.sort((a, b) => {
    const rank = (p: EmailPriority) => (p === "high" ? 0 : p === "normal" ? 1 : 2);
    const d = rank(a.priority) - rank(b.priority);
    if (d !== 0) return d;
    return Date.parse(b.date) - Date.parse(a.date);
  });

  return {
    connected: true,
    imapHost: bundle.imapHost,
    mailboxUser: bundle.imapUsername,
    unreadTotal: messages.length,
    highPriority: messages.filter((m) => m.priority === "high").length,
    needsFollowUp: messages.filter((m) => m.needsFollowUp).length,
    fetchedAt: new Date().toISOString(),
    error: res.error ?? null,
    messages,
  };
}
