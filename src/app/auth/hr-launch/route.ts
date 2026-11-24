import type { NextRequest } from "next/server";

import { handleHrLaunch } from "@/lib/sso/launch-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Canonical launch: POST body/form field launch_token only. No GET, no query string.
 * HS256 JWT iss=hr-portal aud=hr-program:taskmanager sub=platform_user_id slug=taskmanager jti 60s
 */
export async function POST(request: NextRequest) {
  return handleHrLaunch(request);
}
