import type { NextRequest } from "next/server";

import { handleHrLaunch } from "@/lib/sso/launch-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Portal form POST: {origin}/auth/hr-launch  field launch_token
 * HS256 JWT iss=hr-portal aud=hr-program:taskmanager sub=platform_user_id slug=taskmanager jti 60s
 */
export async function POST(request: NextRequest) {
  return handleHrLaunch(request);
}
