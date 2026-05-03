import { getTranslator } from "@/lib/i18n/get-translator";

/** Localised message for server actions (reads NEXT_LOCALE cookie). */
export async function tAction(path: string): Promise<string> {
  const { t } = await getTranslator();
  return t(path);
}

/** Replace `{key}` placeholders in a catalog string (server actions). */
export async function tActionFill(
  path: string,
  vars: Record<string, string>
): Promise<string> {
  let s = await tAction(path);
  for (const [k, v] of Object.entries(vars)) {
    s = s.split(`{${k}}`).join(v);
  }
  return s;
}
