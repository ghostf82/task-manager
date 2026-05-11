/** Small retry helper for flaky Netlify gateway (504) on sequential server actions. Server-safe (no "use client"). */

export function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export type SliceRetryOptions = {
  /** Default 3. Agenda slices often use 5–6 against cold Odoo + Netlify. */
  attempts?: number;
  /** Base delay multiplier grows by (attempt+1). Default 650. */
  baseDelayMs?: number;
};

export async function withSlicePostRetries<T>(
  run: () => Promise<T>,
  opts?: SliceRetryOptions
): Promise<T> {
  const attempts = Math.max(1, Math.min(12, Math.floor(opts?.attempts ?? 3)));
  const base = Math.max(120, Math.floor(opts?.baseDelayMs ?? 650));
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await run();
    } catch (e) {
      last = e;
      if (attempt < attempts - 1) await sleep(base * (attempt + 1));
    }
  }
  throw last;
}
