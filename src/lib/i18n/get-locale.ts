import { cookies } from "next/headers";

export const LOCALE_COOKIE = "NEXT_LOCALE";

export type AppLocale = "ar" | "en";

export async function getLocale(): Promise<AppLocale> {
  const c = await cookies();
  const v = c.get(LOCALE_COOKIE)?.value;
  return v === "en" ? "en" : "ar";
}

export function localeDir(locale: AppLocale): "rtl" | "ltr" {
  return locale === "en" ? "ltr" : "rtl";
}
