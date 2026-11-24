import { NextResponse, type NextRequest } from "next/server";

import { consumeLaunchToken } from "./consume";
import type { LaunchErrorCode } from "./contract";
import { launchRedirectStatus } from "./http";
import { readJwtConfigFromEnv } from "./launch-jwt";
import { queryCarriesLaunchToken, readLaunchTokenFromParts } from "./launch-request";
import { createSupabaseSsoPorts } from "./supabase-ports";

function redirectTo(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, request.url), launchRedirectStatus(request.method));
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

export async function handleHrLaunch(request: NextRequest) {
  if (request.method.toUpperCase() !== "POST") {
    return NextResponse.json({ error: "method" }, { status: 405 });
  }
  if (queryCarriesLaunchToken(request.nextUrl.searchParams)) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const cfg = readJwtConfigFromEnv();
  if ("error" in cfg) {
    return loginError(request, "unconfigured");
  }
  const token = await readBodyToken(request);
  if (!token) {
    return loginError(request, "missing_token");
  }
  try {
    const result = await consumeLaunchToken(token, cfg, createSupabaseSsoPorts);
    if (!result.ok) {
      return loginError(request, result.code);
    }
    return redirectTo(request, "/dashboard");
  } catch {
    return loginError(request, "failed");
  }
}
