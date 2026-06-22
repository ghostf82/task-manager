/** Operational calendar window — near-term work only (P0-A). */

export const CALENDAR_PAST_DAYS = 7;
export const CALENDAR_NEAR_FUTURE_DAYS = 90;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Odoo-style naive datetime `YYYY-MM-DD HH:mm:ss` (local). */
export function formatOdooNaiveDateTime(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export function operationalCalendarWindow(now = new Date()) {
  const start = new Date(now);
  start.setDate(start.getDate() - CALENDAR_PAST_DAYS);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setDate(end.getDate() + CALENDAR_NEAR_FUTURE_DAYS);
  end.setHours(23, 59, 59, 999);
  return {
    startFrom: formatOdooNaiveDateTime(start),
    startBefore: formatOdooNaiveDateTime(end),
    pastDays: CALENDAR_PAST_DAYS,
    nearFutureDays: CALENDAR_NEAR_FUTURE_DAYS,
  };
}

/** Events at or after this threshold belong in the future archive (counts only by default). */
export function futureArchiveStartFrom(now = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + CALENDAR_NEAR_FUTURE_DAYS);
  d.setHours(0, 0, 0, 0);
  return formatOdooNaiveDateTime(d);
}

/** Domain matching Odoo calendar overlap for a time window. */
export function calendarOverlapDomain(startFrom: string, startBefore: string): unknown[] {
  return [
    ["start", "<", startBefore],
    ["stop", ">", startFrom],
  ];
}
