import { NextResponse, type NextRequest } from "next/server";

import { consumeLaunchToken, type SsoPortsSource } from "./consume";
import { LAUNCH_SUCCESS_PATH, type LaunchErrorCode } from "./contract";
import { launchRedirectStatus } from "./http";
import { readJwtConfigFromEnv, type JwtVerifyConfig } from "./launch-jwt";
import { queryCarriesLaunchToken, readLaunchTokenFromParts } from "./launch-request";
import { createSupabaseSsoPorts } from "./supabase-ports";

export type HrLaunchDeps = {
  jwtConfig?: JwtVerifyConfig | { error: LaunchErrorCode };
  ports?: SsoPortsSource;
};

function redirectTo(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, request.url), launchRedirectStatus(request.method));
}

function jwtConfigFrom(
  deps: HrLaunchDeps
): JwtVerifyConfig | { error: LaunchErrorCode } {
  return deps.jwtConfig ?? readJwtConfigFromEnv();
}

function loginError(request: NextRequest, code: LaunchErrorCode | "missing_token") {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", `sso_${code}`);
  return NextResponse.redirect(url, launchRedirectStatus(request.method));
}

async function readBodyToken(request: NextRequest): Promise<string> {
  const contentType = request.headers.get("content-type") ?? "";
  let json: Record<string, unknown> | null = null;
  let formGet: ((name: string) => FormDataEntryValue | null) | undefined;
  if (contentType.includes("application/json")) {
    json = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  } else {
    const form = await request.formData().catch(() => null);
    if (form) formGet = (name) => form.get(name);
  }
  return readLaunchTokenFromParts({
    method: "POST",
    json,
    formGet,
  });
}

export async function handleHrLaunch(request: NextRequest, deps: HrLaunchDeps = {}) {
  if (request.method.toUpperCase() !== "POST") {
    return NextResponse.json({ error: "method" }, { status: 405 });
  }
  if (queryCarriesLaunchToken(request.nextUrl.searchParams)) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const cfg = jwtConfigFrom(deps);
  if ("error" in cfg) {
    return loginError(request, "unconfigured");
  }
  const token = await readBodyToken(request);
  if (!token) {
    return loginError(request, "missing_token");
  }
  try {
    const result = await consumeLaunchToken(
      token,
      cfg,
      deps.ports ?? createSupabaseSsoPorts
    );
    if (!result.ok) {
      return loginError(request, result.code);
    }
    return redirectTo(request, LAUNCH_SUCCESS_PATH);
  } catch {
    return loginError(request, "failed");
  }
}
