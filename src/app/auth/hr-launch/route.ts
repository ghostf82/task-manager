import type { NextRequest } from "next/server";

import { handleHrLaunch } from "@/lib/sso/launch-handler";
import {
  handleIsolatedHrLaunch,
  isolatedLoopbackEnabled,
} from "@/lib/sso/isolated-loopback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Canonical launch: POST body/form field launch_token only. No GET, no query string.
 * HS256 JWT iss=hr-portal aud=hr-program:taskmanager sub=platform_user_id slug=taskmanager jti 60s
 * Success: 303 /dashboard (native executive briefing + AppSidebar, not an SSO proof page).
 */
export async function POST(request: NextRequest) {
  if (isolatedLoopbackEnabled()) {
    return handleIsolatedHrLaunch(request);
  }
  return handleHrLaunch(request);
}
