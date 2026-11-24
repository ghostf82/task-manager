import { LAUNCH_TOKEN_FIELD } from "./contract";

export function pickLaunchToken(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/** Contract: never query string. True when the URL carries a launch token. */
export function queryCarriesLaunchToken(query?: URLSearchParams): boolean {
  return Boolean(
    pickLaunchToken(query?.get(LAUNCH_TOKEN_FIELD), query?.get("token"))
  );
}

/** Portal posts `launch_token` in the body. Query-string tokens are not read. */
export function readLaunchTokenFromParts(input: {
  method: string;
  query?: URLSearchParams;
  json?: Record<string, unknown> | null;
  formGet?: (name: string) => FormDataEntryValue | null;
}): string {
  if (queryCarriesLaunchToken(input.query)) return "";
  if (input.method.toUpperCase() === "GET") return "";
  const jsonToken = pickLaunchToken(
    input.json?.[LAUNCH_TOKEN_FIELD],
    input.json?.token
  );
  if (jsonToken) return jsonToken;
  return pickLaunchToken(
    input.formGet?.(LAUNCH_TOKEN_FIELD),
    input.formGet?.("token")
  );
}
