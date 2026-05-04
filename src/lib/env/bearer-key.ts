import "server-only";

/**
 * `fetch()` header values must be ISO-8859-1 (ByteString). Non‑Latin‑1 code units
 * in keys (e.g. Arabic placeholder text in `.env`) cause runtime errors such as
 * "Cannot convert argument to a ByteString… character … greater than 255".
 */
export function bearerKeyIsLatin1Safe(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) > 255) return false;
  }
  return true;
}

/** Treat values with non–Latin-1 code units as unset (invalid in HTTP ByteString headers). */
export function trimHeaderSafeSecret(raw: string | undefined): string | undefined {
  const v = raw?.trim();
  if (!v) return undefined;
  if (!bearerKeyIsLatin1Safe(v)) return undefined;
  return v;
}
