import type { AppLocale } from "@/lib/i18n/get-locale";
import { getLocale } from "@/lib/i18n/get-locale";
import ar from "@/messages/ar.json";
import en from "@/messages/en.json";

const catalogs = { ar, en } as const;

export type MessageCatalog = typeof ar;

function dig(obj: unknown, path: string): string | undefined {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === "string" ? cur : undefined;
}

export function getCatalog(locale: AppLocale): MessageCatalog {
  return catalogs[locale] as MessageCatalog;
}

export async function getTranslator(locale?: AppLocale) {
  const loc = locale ?? (await getLocale());
  const catalog = getCatalog(loc);
  function t(path: string): string {
    return dig(catalog, path) ?? path;
  }
  return { t, locale: loc, catalog };
}
