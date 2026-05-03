export const LOCALE_COOKIE = "NEXT_LOCALE";

export type AppLocale = "ar" | "en";

export function localeDir(locale: AppLocale): "rtl" | "ltr" {
  return locale === "en" ? "ltr" : "rtl";
}

/** BCP-47 locale for `toLocaleString` / `Intl` (English UI uses UK grouping). */
export function dateLocaleFor(locale: AppLocale): string {
  return locale === "en" ? "en-GB" : "ar-SA";
}
