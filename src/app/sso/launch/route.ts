import type { NextRequest } from "next/server";

import { handleHrLaunch } from "@/lib/sso/launch-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Compatibility alias. Portal posts `/auth/hr-launch` with `launch_token`. */
export async function GET(request: NextRequest) {
  return handleHrLaunch(request);
}

export async function POST(request: NextRequest) {
  return handleHrLaunch(request);
}
