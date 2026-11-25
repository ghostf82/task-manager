import type { NextRequest } from "next/server";

import { handleHrLaunch } from "@/lib/sso/launch-handler";
import {
  handleIsolatedHrLaunch,
  isolatedLoopbackEnabledForRequest,
} from "@/lib/sso/isolated-loopback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Canonical launch: POST body/form field launch_token only. No GET, no query string.
 * HS256 JWT iss=hr-portal aud=hr-program:odoo-taskmanager sub=platform_user_id
 * slug=odoo-taskmanager jti 60s. Exclusive: portal super_admin only.
 * Origin: https://fared-taskmanager.netlify.app — never hr-task-manager.
 * Success: 303 /dashboard (native executive briefing + AppSidebar, not an SSO proof page).
 */
export async function POST(request: NextRequest) {
  if (isolatedLoopbackEnabledForRequest(request)) {
    return handleIsolatedHrLaunch(request);
  }
  return handleHrLaunch(request);
}
