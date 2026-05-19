/** PostgREST / Postgres errors when schema lags behind app (migration not applied). */

export type SupabaseErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
} | null;

function errorText(error: SupabaseErrorLike): string {
  return [error?.message, error?.details, error?.hint].filter(Boolean).join(" ").toLowerCase();
}

export function isMissingColumn(error: SupabaseErrorLike, column: string): boolean {
  if (!error) return false;
  const col = column.toLowerCase();
  const text = errorText(error);
  if (error.code === "42703" || error.code === "PGRST204") {
    return text.includes(col);
  }
  return text.includes("does not exist") && text.includes(col);
}

export function isMissingTable(error: SupabaseErrorLike, table: string): boolean {
  if (!error) return false;
  const tbl = table.toLowerCase();
  const text = errorText(error);
  if (error.code === "42P01" || error.code === "PGRST205") {
    return text.includes(tbl);
  }
  return (
    (text.includes("does not exist") || text.includes("could not find")) &&
    text.includes(tbl)
  );
}

/** Client-side session id when `ai_chat_sessions` is not migrated yet. */
export const LEGACY_AI_CHAT_SESSION_ID = "__legacy__";

export function isLegacyAiChatSessionId(sessionId: string | null | undefined): boolean {
  return !sessionId?.trim() || sessionId === LEGACY_AI_CHAT_SESSION_ID;
}
