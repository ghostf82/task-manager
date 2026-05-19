/** Debug-mode NDJSON ingest (session 6e84fc). Safe for client and server. */
export function debugLog(
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
  // #region agent log
  fetch("http://127.0.0.1:7521/ingest/be47065e-d94d-4ea9-ba05-564706e1b09a", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "6e84fc",
    },
    body: JSON.stringify(payload),
  }).catch(() => {});
  // #endregion
}
