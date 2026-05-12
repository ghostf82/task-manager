/**
 * Canonical public site URL (HTTPS) for metadata, absolute links, and hosting config.
 * Set `NEXT_PUBLIC_SITE_URL` in production (e.g. Netlify env) to your final domain.
 * On Netlify builds, `URL` / `DEPLOY_PRIME_URL` are injected when unset.
 */
export function getPublicSiteUrl(): string | undefined {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.URL?.trim() ||
    process.env.DEPLOY_PRIME_URL?.trim();
  if (!raw) return undefined;
  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withProto);
    if (u.protocol !== "https:" && u.protocol !== "http:") return undefined;
    return u.origin;
  } catch {
    return undefined;
  }
}

export function getMetadataBase(): URL | undefined {
  const origin = getPublicSiteUrl();
  if (!origin) return undefined;
  try {
    return new URL(origin);
  } catch {
    return undefined;
  }
}
