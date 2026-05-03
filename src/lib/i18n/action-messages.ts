import { getTranslator } from "@/lib/i18n/get-translator";

/** Localised message for server actions (reads NEXT_LOCALE cookie). */
export async function tAction(path: string): Promise<string> {
  const { t } = await getTranslator();
  return t(path);
}
