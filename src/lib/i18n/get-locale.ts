import { cookies } from "next/headers";

import type { AppLocale } from "@/lib/i18n/locale-core";
import { LOCALE_COOKIE } from "@/lib/i18n/locale-core";

export { LOCALE_COOKIE, type AppLocale, dateLocaleFor, localeDir } from "@/lib/i18n/locale-core";

export async function getLocale(): Promise<AppLocale> {
  const c = await cookies();
  const v = c.get(LOCALE_COOKIE)?.value;
  return v === "en" ? "en" : "ar";
}
