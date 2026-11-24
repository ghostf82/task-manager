import { LAUNCH_TOKEN_FIELD } from "./contract";

export function pickLaunchToken(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/** Portal posts `launch_token`. `token` remains a compatibility alias. */
export function readLaunchTokenFromParts(input: {
  method: string;
  query?: URLSearchParams;
  json?: Record<string, unknown> | null;
  formGet?: (name: string) => FormDataEntryValue | null;
}): string {
  const queryToken = pickLaunchToken(
    input.query?.get(LAUNCH_TOKEN_FIELD),
    input.query?.get("token")
  );
  if (queryToken) return queryToken;
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
