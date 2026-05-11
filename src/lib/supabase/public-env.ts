/**
 * Validates public Supabase env used by @supabase/ssr.
 * Prevents mistaking a PostgreSQL DSN or LAN URL for NEXT_PUBLIC_SUPABASE_URL (common Netlify misconfiguration).
 */
export function getValidatedSupabasePublicEnv(): { url: string; anonKey: string } {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  if (!url || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL و NEXT_PUBLIC_SUPABASE_ANON_KEY مطلوبان.");
  }
  const lower = url.toLowerCase();
  if (lower.startsWith("postgres://") || lower.startsWith("postgresql://")) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL يبدو أنه عنوان اتصال PostgreSQL (postgresql://…). استخدم رابط مشروع Supabase (https://…supabase.co) من لوحة Supabase → Settings → API، وليس عنوان قاعدة داخلية."
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL ليس عنوانًا صالحًا.");
  }
  const host = parsed.hostname;
  const isPrivateLan =
    /^192\.168\.\d+\.\d+$/.test(host) ||
    /^10\.\d+\.\d+\.\d+$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host);
  if (process.env.NODE_ENV === "production") {
    if (parsed.protocol !== "https:") {
      throw new Error("في الإنتاج يجب أن يبدأ NEXT_PUBLIC_SUPABASE_URL بـ https://");
    }
    if (isPrivateLan) {
      throw new Error(
        `NEXT_PUBLIC_SUPABASE_URL يستخدم عنوان شبكة داخلية (${host}). على Netlify ضع رابط مشروع Supabase العام فقط.`
      );
    }
  }
  return { url, anonKey };
}
