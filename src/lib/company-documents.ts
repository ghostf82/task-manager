export type CompanyDocumentStatus = "valid" | "expired" | "renewal_pending";

export type DocumentRowTone = "ok" | "warning" | "overdue";

/** Calendar-day difference: expiry_date minus today (UTC date string YYYY-MM-DD). */
export function documentDaysUntilExpiry(expiryDateStr: string, todayStr: string): number {
  const a = new Date(`${expiryDateStr}T12:00:00.000Z`).getTime();
  const b = new Date(`${todayStr}T12:00:00.000Z`).getTime();
  return Math.round((a - b) / 86400000);
}

export function documentRowTone(
  expiryDateStr: string,
  alertDaysBefore: number,
  todayStr: string
): DocumentRowTone {
  const d = documentDaysUntilExpiry(expiryDateStr, todayStr);
  if (d < 0) return "overdue";
  if (d <= alertDaysBefore) return "warning";
  return "ok";
}

export const documentStatusLabelsAr: Record<CompanyDocumentStatus, string> = {
  valid: "صالح",
  expired: "منتهي",
  renewal_pending: "قيد التجديد",
};

export const documentToneRowClasses: Record<DocumentRowTone, string> = {
  ok: "bg-emerald-500/12 hover:bg-emerald-500/18 border-emerald-600/15",
  warning: "bg-amber-500/15 hover:bg-amber-500/22 border-amber-600/20",
  overdue: "bg-red-500/15 hover:bg-red-500/22 border-red-600/25",
};

export const documentToneExcelArgb: Record<DocumentRowTone, string> = {
  ok: "FFD1FAE5",
  warning: "FFFDE68A",
  overdue: "FFFECACA",
};
