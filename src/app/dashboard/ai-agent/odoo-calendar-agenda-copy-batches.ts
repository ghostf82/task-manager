"use client";

import {
  appendOdooAgendaFallbackAction,
  duplicateOdooAgendaMailSliceAction,
  duplicateOdooAgendaTableSliceAction,
  revalidateAiAgentOdooPanelAction,
} from "@/app/dashboard/ai-agent/actions";
import { sleep, withSlicePostRetries } from "@/lib/netlify-slice-retry";

/** One Odoo create per server action keeps Netlify well under typical function limits. */
const TABLE_SLICE = 1;
const MAIL_SLICE = 1;

/** Pause between successful slice POSTs to reduce gateway / Odoo burst (ms). */
const SLICE_GAP_MS = 130;

const AGENDA_SLICE_RETRY: { attempts: number; baseDelayMs: number } = {
  attempts: 6,
  baseDelayMs: 900,
};

export type OdooAgendaCopyPhase = "table" | "mail" | "fallback" | "revalidate";

export type OdooAgendaCopyProgressInfo = {
  phase: OdooAgendaCopyPhase;
  /** Progress within the current phase (e.g. rows processed). */
  current: number;
  total: number;
  /** Monotonic 0–100 across table + mail + tail (secondary readout). */
  overallPercent: number;
  /** 0–100 for the active phase — matches X/Y (14/14 → 100). */
  phasePercent: number;
  message: string;
};

export type CopyOdooMeetingAgendaResult =
  | {
      ok: true;
      agendaTableItemsCreated: number;
      agendaActivitiesCreated: number;
      skippedApprox: number;
      fallbackDescriptionUpdated: boolean;
    }
  | {
      ok: false;
      error: string;
      /** Where the chain stopped (for precise retry / support messaging). */
      failedAt?: {
        phase: "table" | "mail";
        fromIndex: number;
        phaseTotal: number | null;
      };
    };

function microYield(): Promise<void> {
  if (typeof requestAnimationFrame === "function") {
    return new Promise((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function clampPercent(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}

function phasePercent(done: number, total: number): number {
  if (!total) return 0;
  return clampPercent((done / total) * 100);
}

/** Table leg maps into ~0–46 of overall; reserve rest for mail + tail. */
function overallTable(done: number, tableTotal: number): number {
  if (!tableTotal) return 0;
  return clampPercent((done / tableTotal) * 46);
}

/** Mail leg: ~46–86 of overall. */
function overallMail(done: number, mailTotal: number): number {
  if (!mailTotal) return 86;
  return clampPercent(46 + (done / mailTotal) * 40);
}

function isTransientSliceFailure(msg: string): boolean {
  return /504|Gateway|gateway|timeout|Timed out|انتهت|unexpected response|fetch failed/i.test(msg);
}

/** Retries when the client throws *or* the action returns a transient gateway-style error. */
async function duplicateOdooAgendaTableSliceWithRetries(input: {
  sourceEventId: number;
  targetEventId: number;
  fromIndex: number;
  batchSize: number;
  knownTotalRows?: number;
}): Promise<
  | { ok: true; totalRows: number; agendaItemsCreated: number; skippedInBatch: number }
  | { ok: false; error: string }
> {
  return await withSlicePostRetries(async () => {
    const r = await duplicateOdooAgendaTableSliceAction(input);
    if (r.ok) return r;
    if (isTransientSliceFailure(r.error)) throw new Error(r.error);
    return r;
  }, AGENDA_SLICE_RETRY);
}

async function duplicateOdooAgendaMailSliceWithRetries(input: {
  sourceEventId: number;
  targetEventId: number;
  targetEventStart: string;
  sourceEventStart?: string;
  fromIndex: number;
  batchSize: number;
  knownTotalRows?: number;
}): Promise<
  | { ok: true; totalRows: number; created: number; skippedInBatch: number }
  | { ok: false; error: string }
> {
  return await withSlicePostRetries(async () => {
    const r = await duplicateOdooAgendaMailSliceAction(input);
    if (r.ok) return r;
    if (isTransientSliceFailure(r.error)) throw new Error(r.error);
    return r;
  }, AGENDA_SLICE_RETRY);
}

/**
 * Copies meeting agenda using many small server actions (Netlify-friendly).
 * Each slice is awaited to completion before the next (sequential, atomic per POST).
 * Caller should run after `cloneOdooCalendarEventPhaseOneAction`.
 */
export async function copyOdooMeetingAgendaInSlices(params: {
  sourceEventId: number;
  targetEventId: number;
  targetEventStart: string;
  /** Original source event `start` (for shifting `mail.activity` deadlines). */
  sourceEventStart?: string;
  targetDescriptionForFallback?: string;
  onProgress?: (info: OdooAgendaCopyProgressInfo) => void;
  /** When true, skip `revalidatePath` (caller revalidates once after a bulk loop). */
  skipFinalRevalidate?: boolean;
}): Promise<CopyOdooMeetingAgendaResult> {
  let agendaTableItemsCreated = 0;
  let agendaActivitiesCreated = 0;
  let skippedApprox = 0;

  params.onProgress?.({
    phase: "table",
    current: 0,
    total: 0,
    overallPercent: 0,
    phasePercent: 0,
    message: "جاري تجهيز نسخ جدول الأجندة…",
  });

  let from = 0;
  let tableTotal: number | null = null;
  while (true) {
    if (from > 0) await sleep(SLICE_GAP_MS);
    let r:
      | { ok: true; totalRows: number; agendaItemsCreated: number; skippedInBatch: number }
      | { ok: false; error: string };
    try {
      r = await duplicateOdooAgendaTableSliceWithRetries({
        sourceEventId: params.sourceEventId,
        targetEventId: params.targetEventId,
        fromIndex: from,
        batchSize: TABLE_SLICE,
        knownTotalRows: tableTotal !== null ? tableTotal : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        error: msg || "انقطع الاتصال أثناء نسخ جدول الأجندة (جرّب إعادة المحاولة).",
        failedAt: { phase: "table", fromIndex: from, phaseTotal: tableTotal },
      };
    }
    if (!r.ok) {
      return {
        ok: false,
        error: r.error,
        failedAt: {
          phase: "table",
          fromIndex: from,
          phaseTotal: tableTotal,
        },
      };
    }
    if (tableTotal === null) {
      tableTotal = r.totalRows;
      if (!tableTotal) break;
    }
    agendaTableItemsCreated += r.agendaItemsCreated;
    skippedApprox += r.skippedInBatch;
    if (
      tableTotal !== null &&
      tableTotal > 0 &&
      from < tableTotal &&
      r.agendaItemsCreated === 0 &&
      r.skippedInBatch > 0
    ) {
      return {
        ok: false,
        error:
          "تعذّر حفظ بند الأجندة في Odoo (غالبًا لأنك لست منظم الحدث أو تفتقد صلاحية إنشاء «بند أجندة الاجتماع»). أعد المحاولة بعد التأكد أن المنظم هو حسابك.",
        failedAt: { phase: "table", fromIndex: from, phaseTotal: tableTotal },
      };
    }
    const saved = agendaTableItemsCreated;
    const ph = phasePercent(saved, tableTotal);
    const ov = overallTable(saved, tableTotal);
    params.onProgress?.({
      phase: "table",
      current: saved,
      total: tableTotal,
      overallPercent: ov,
      phasePercent: ph,
      message: `جدول الأجندة: تم حفظ ${saved} من ${tableTotal} في Odoo — المرحلة ${ph}٪ · الإجمالي ${ov}٪`,
    });
    from += TABLE_SLICE;
    await microYield();
    if (tableTotal !== null && from >= tableTotal) break;
  }

  if (tableTotal !== null && tableTotal > 0 && agendaTableItemsCreated === 0) {
    return {
      ok: false,
      error:
        "Odoo يشير إلى وجود بنود في جدول الأجندة لكن لم يُنشأ أي سطر على الحدث الجديد (تحقق من صلاحية إنشاء «بند أجندة الاجتماع» أو من سجلات Odoo).",
      failedAt: { phase: "table", fromIndex: 0, phaseTotal: tableTotal },
    };
  }

  params.onProgress?.({
    phase: "mail",
    current: 0,
    total: 0,
    overallPercent: 46,
    phasePercent: 0,
    message: "اكتمل جدول الأجندة (إن وُجد) — جاري مرحلة الأنشطة البريدية…",
  });
  from = 0;
  let mailTotal: number | null = null;
  while (true) {
    if (from > 0) await sleep(SLICE_GAP_MS);
    let r: { ok: true; totalRows: number; created: number; skippedInBatch: number } | { ok: false; error: string };
    try {
      r = await duplicateOdooAgendaMailSliceWithRetries({
        sourceEventId: params.sourceEventId,
        targetEventId: params.targetEventId,
        targetEventStart: params.targetEventStart,
        sourceEventStart: params.sourceEventStart,
        fromIndex: from,
        batchSize: MAIL_SLICE,
        knownTotalRows: mailTotal !== null ? mailTotal : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        error: msg || "انقطع الاتصال أثناء نسخ الأنشطة البريدية (جرّب إعادة المحاولة).",
        failedAt: { phase: "mail", fromIndex: from, phaseTotal: mailTotal },
      };
    }
    if (!r.ok) {
      return {
        ok: false,
        error: r.error,
        failedAt: {
          phase: "mail",
          fromIndex: from,
          phaseTotal: mailTotal,
        },
      };
    }
    if (mailTotal === null) {
      mailTotal = r.totalRows;
      if (!mailTotal) break;
    }
    agendaActivitiesCreated += r.created;
    skippedApprox += r.skippedInBatch;
    const mailSaved = agendaActivitiesCreated;
    const ph = phasePercent(mailSaved, mailTotal);
    const ov = overallMail(mailSaved, mailTotal);
    params.onProgress?.({
      phase: "mail",
      current: mailSaved,
      total: mailTotal,
      overallPercent: ov,
      phasePercent: ph,
      message: `الأنشطة البريدية: تم حفظ ${mailSaved} من ${mailTotal} في Odoo — المرحلة ${ph}٪ · الإجمالي ${ov}٪`,
    });
    from += MAIL_SLICE;
    await microYield();
    if (mailTotal !== null && from >= mailTotal) break;
  }

  params.onProgress?.({
    phase: "fallback",
    current: 1,
    total: 1,
    overallPercent: 88,
    phasePercent: 100,
    message: "جاري التحقق من الوصف الاحتياطي…",
  });
  let fb: { ok: true; updated: boolean } | { ok: false; error: string };
  try {
    fb = await withSlicePostRetries(
      () =>
        appendOdooAgendaFallbackAction({
          sourceEventId: params.sourceEventId,
          targetEventId: params.targetEventId,
          targetDescriptionForFallback: params.targetDescriptionForFallback,
          agendaItemsCreated: agendaTableItemsCreated,
          mailActivitiesCreated: agendaActivitiesCreated,
        }),
      { attempts: 4, baseDelayMs: 700 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg || "فشل خطوة الوصف الاحتياطي بعد نسخ الأجندة." };
  }
  if (!fb.ok) {
    return { ok: false, error: fb.error };
  }

  if (!params.skipFinalRevalidate) {
    params.onProgress?.({
      phase: "revalidate",
      current: 1,
      total: 1,
      overallPercent: 94,
      phasePercent: 100,
      message: "جاري تحديث العرض…",
    });
    try {
      await withSlicePostRetries(() => revalidateAiAgentOdooPanelAction(), {
        attempts: 4,
        baseDelayMs: 700,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg || "فشل تحديث العرض بعد نسخ الأجندة (البيانات قد تكون في Odoo)." };
    }
  }

  params.onProgress?.({
    phase: "revalidate",
    current: 1,
    total: 1,
    overallPercent: 100,
    phasePercent: 100,
    message: "اكتمل نسخ الأجندة.",
  });

  return {
    ok: true,
    agendaTableItemsCreated,
    agendaActivitiesCreated,
    skippedApprox,
    fallbackDescriptionUpdated: fb.updated,
  };
}
