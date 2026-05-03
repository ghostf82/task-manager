import { dig } from "@/lib/i18n/dig";
import type { AppLocale } from "@/lib/i18n/locale-core";
import { getLocale } from "@/lib/i18n/get-locale";
import ar from "@/messages/ar.json";
import en from "@/messages/en.json";

const catalogs = { ar, en } as const;

export type MessageCatalog = typeof ar;

export function getCatalog(locale: AppLocale): MessageCatalog {
  return catalogs[locale] as MessageCatalog;
}

export async function getTranslator(locale?: AppLocale) {
  const loc = locale ?? (await getLocale());
  const catalog = getCatalog(loc);
  function t(path: string): string {
    const v = dig(catalog, path);
    if (v !== undefined) return v;
    if (process.env.NODE_ENV === "development") {
      console.warn(`[i18n] Missing key for locale "${loc}": ${path}`);
    }
    return path;
  }
  return { t, locale: loc, catalog };
}
