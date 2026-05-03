/** Optional Resend integration for reminder emails. */

export async function sendReminderEmail(to: string, title: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false as const, skipped: true };

  const from =
    process.env.RESEND_FROM_EMAIL ?? "ERP Tasks <onboarding@resend.dev>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `تذكير: ${title}`,
      html: `<p dir="rtl" style="font-family:system-ui,sans-serif">${title}</p><p dir="rtl">حان وقت التذكير الشخصي في منصة المهام.</p>`,
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Resend: ${res.status} ${t}`);
  }
  return { ok: true as const, skipped: false };
}
