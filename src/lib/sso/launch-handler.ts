import { NextResponse, type NextRequest } from "next/server";

import { consumeLaunchToken } from "./consume";
import type { LaunchErrorCode } from "./contract";
import { launchRedirectStatus } from "./http";
import { readJwtConfigFromEnv } from "./launch-jwt";
import { readLaunchTokenFromParts } from "./launch-request";
import { createSupabaseSsoPorts } from "./supabase-ports";

function redirectTo(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, request.url), launchRedirectStatus(request.method));
}

function loginError(request: NextRequest, code: LaunchErrorCode | "missing_token") {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", `sso_${code}`);
  return NextResponse.redirect(url, launchRedirectStatus(request.method));
}

async function readToken(request: NextRequest): Promise<string> {
  const contentType = request.headers.get("content-type") ?? "";
  let json: Record<string, unknown> | null = null;
  let formGet: ((name: string) => FormDataEntryValue | null) | undefined;
  if (request.method !== "GET") {
    if (contentType.includes("application/json")) {
      json = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    } else {
      const form = await request.formData().catch(() => null);
      if (form) formGet = (name) => form.get(name);
    }
  }
  return readLaunchTokenFromParts({
    method: request.method,
    query: request.nextUrl.searchParams,
    json,
    formGet,
  });
}

export async function handleHrLaunch(request: NextRequest) {
  const cfg = readJwtConfigFromEnv();
  if ("error" in cfg) {
    return loginError(request, "unconfigured");
  }
  const token = await readToken(request);
  if (!token) {
    return loginError(request, "missing_token");
  }
  try {
    const result = await consumeLaunchToken(token, cfg, createSupabaseSsoPorts());
    if (!result.ok) {
      return loginError(request, result.code);
    }
    return redirectTo(request, "/dashboard");
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (/Missing SUPABASE_SERVICE_ROLE_KEY|42P01|does not exist/i.test(message)) {
      return loginError(request, "unconfigured");
    }
    return loginError(request, "failed");
  }
}
