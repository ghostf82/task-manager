/** Small retry helper for flaky Netlify gateway (504) on sequential server actions. Server-safe (no "use client"). */

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function withSlicePostRetries<T>(run: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await run();
    } catch (e) {
      last = e;
      if (attempt < 2) await sleep(650 * (attempt + 1));
    }
  }
  throw last;
}
