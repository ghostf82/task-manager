/**
 * Replaces Vercel Cron: calls the Next.js route /api/cron/reminders every 15 minutes (UTC).
 * Requires env: URL (Netlify deploy URL), CRON_SECRET (must match the Next route).
 */
export default async (req) => {
  let nextRun;
  try {
    const body = await req.json();
    nextRun = body?.next_run;
  } catch {
    // non-JSON body is fine for manual invokes
  }
  const base = (process.env.URL || "").replace(/\/$/, "");
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    console.error("cron-reminders: missing URL or CRON_SECRET");
    return new Response(
      JSON.stringify({ error: "missing URL or CRON_SECRET" }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
  const res = await fetch(`${base}/api/cron/reminders`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const text = await res.text();
  console.log("cron-reminders:", res.status, nextRun ?? "");
  return new Response(text, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "text/plain" },
  });
};

export const config = {
  schedule: "*/15 * * * *",
};
