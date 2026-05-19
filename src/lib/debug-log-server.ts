import "server-only";

import { appendFileSync } from "fs";
import { join } from "path";

import { debugLog } from "@/lib/debug-log";

/** Server-only debug log (also writes NDJSON file in development). */
export function debugLogServer(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
  runId = "pre-fix"
) {
  const payload = {
    sessionId: "6e84fc",
    location,
    message,
    data,
    hypothesisId,
    runId,
    timestamp: Date.now(),
  };
  if (process.env.NODE_ENV === "development") {
    try {
      appendFileSync(join(process.cwd(), "debug-6e84fc.log"), `${JSON.stringify(payload)}\n`);
    } catch {
      /* ignore */
    }
  }
  debugLog(location, message, data, hypothesisId, runId);
}
