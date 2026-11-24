import { NextResponse, type NextRequest } from "next/server";

import { consumeLaunchToken } from "@/lib/sso/consume";
import type { LaunchErrorCode } from "@/lib/sso/contract";
import { launchRedirectStatus } from "@/lib/sso/http";
import { readJwtConfigFromEnv } from "@/lib/sso/launch-jwt";
import { createSupabaseSsoPorts } from "@/lib/sso/supabase-ports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectTo(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, request.url), launchRedirectStatus(request.method));
}

function loginError(request: NextRequest, code: LaunchErrorCode | "missing_token") {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", `sso_${code}`);
  return NextResponse.redirect(url, launchRedirectStatus(request.method));
}

async function readToken(request: NextRequest): Promise<string> {
  const fromQuery = request.nextUrl.searchParams.get("token")?.trim();
  if (fromQuery) return fromQuery;
  const contentType = request.headers.get("content-type") ?? "";
  if (request.method === "GET") return "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
    return typeof body?.token === "string" ? body.token.trim() : "";
  }
  const form = await request.formData().catch(() => null);
  const fromForm = form?.get("token");
  return typeof fromForm === "string" ? fromForm.trim() : "";
}

async function handle(request: NextRequest) {
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

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
