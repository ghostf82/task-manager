/** Shared task scheduling / UI tone (used on server and client). Dates as `YYYY-MM-DD`. */

export type TaskStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "on_hold"
  | "cancelled";

export type TaskRowTone =
  | "overdue"
  | "due_soon"
  | "followed_today"
  | "completed"
  | "neutral";

const MS_PER_DAY = 86_400_000;

function parseUtcDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function utcToday(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

/** Whole days from today (UTC) until due date; negative if overdue. */
export function daysRemaining(dueOn: string): number {
  const due = parseUtcDate(dueOn).getTime();
  const today = utcToday().getTime();
  return Math.round((due - today) / MS_PER_DAY);
}

/** Approximate calendar months remaining (ceil of days/30), min 0 when not overdue side. */
export function monthsRemaining(dueOn: string): number {
  const d = daysRemaining(dueOn);
  if (d <= 0) return 0;
  return Math.max(1, Math.ceil(d / 30));
}

export function taskRowTone(input: {
  status: TaskStatus;
  dueOn: string;
  followedUpOn: string | null;
}): TaskRowTone {
  if (input.status === "completed") return "completed";

  const todayStr = utcToday().toISOString().slice(0, 10);
  if (input.followedUpOn && input.followedUpOn === todayStr) {
    return "followed_today";
  }

  const dr = daysRemaining(input.dueOn);
  if (dr < 0) return "overdue";
  if (dr >= 0 && dr <= 7) return "due_soon";
  return "neutral";
}

export const taskToneClasses: Record<TaskRowTone, string> = {
  overdue: "bg-red-500/10 border-red-500/30",
  due_soon: "bg-amber-500/10 border-amber-500/30",
  followed_today: "bg-emerald-500/15 border-emerald-500/35",
  completed: "bg-emerald-500/10 border-emerald-500/30",
  neutral: "border-border/60",
};

export const statusLabelsAr: Record<TaskStatus, string> = {
  not_started: "لم يبدأ",
  in_progress: "قيد التنفيذ",
  completed: "مكتمل",
  on_hold: "معلق",
  cancelled: "ملغى",
};
