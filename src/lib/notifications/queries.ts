import type { SupabaseClient } from "@supabase/supabase-js";

import { isMissingColumn } from "@/lib/supabase/schema-compat";

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
  read_at: string | null;
  archived_at: string | null;
};

type FetchOptions = {
  userId: string;
  limit: number;
  /** Exclude archived rows (header menu). Ignored when `archived_at` column is missing. */
  activeOnly?: boolean;
};

export type FetchNotificationsResult =
  | { ok: true; rows: NotificationRow[]; supportsArchive: boolean }
  | { ok: false; friendlyMessage: string };

function mapRow(
  r: Record<string, unknown>,
  supportsArchive: boolean
): NotificationRow {
  return {
    id: String(r.id),
    type: String(r.type ?? "info"),
    title: String(r.title ?? ""),
    body: r.body == null ? null : String(r.body),
    payload:
      r.payload && typeof r.payload === "object" && !Array.isArray(r.payload)
        ? (r.payload as Record<string, unknown>)
        : null,
    created_at: String(r.created_at),
    read_at: r.read_at ? String(r.read_at) : null,
    archived_at:
      supportsArchive && r.archived_at ? String(r.archived_at) : null,
  };
}

export async function fetchNotificationsForUser(
  supabase: SupabaseClient,
  options: FetchOptions
): Promise<FetchNotificationsResult> {
  const withArchive =
    "id,type,title,body,payload,read_at,archived_at,created_at" as const;
  const withoutArchive = "id,type,title,body,payload,read_at,created_at" as const;

  let query = supabase
    .from("notifications")
    .select(withArchive)
    .eq("user_id", options.userId)
    .order("created_at", { ascending: false })
    .limit(options.limit);

  if (options.activeOnly) {
    query = query.is("archived_at", null);
  }

  const { data, error } = await query;

  if (error && isMissingColumn(error, "archived_at")) {
    const legacyRes = await supabase
      .from("notifications")
      .select(withoutArchive)
      .eq("user_id", options.userId)
      .order("created_at", { ascending: false })
      .limit(options.limit);
    if (legacyRes.error) {
      return { ok: false, friendlyMessage: "تعذّر تحميل الإشعارات. حاول لاحقاً." };
    }
    return {
      ok: true,
      supportsArchive: false,
      rows: (legacyRes.data ?? []).map((r) => mapRow(r as Record<string, unknown>, false)),
    };
  }

  if (error) {
    return { ok: false, friendlyMessage: "تعذّر تحميل الإشعارات. حاول لاحقاً." };
  }

  return {
    ok: true,
    supportsArchive: true,
    rows: (data ?? []).map((r) => mapRow(r as Record<string, unknown>, true)),
  };
}
