import { LAUNCH_SUCCESS_PATH } from "./contract";

/** POST must not 307 (browser would POST the launch body to the dashboard). */
export function launchRedirectStatus(method: string): 303 | 307 {
  return method.toUpperCase() === "POST" ? 303 : 307;
}

/**
 * Origin-relative Location. Next `request.url` in `next dev` rewrites
 * `127.0.0.1` to `localhost`; an absolute 303 would drop the host-only `tm_sso`.
 */
export function relativeLaunchLocation(pathAndQuery: string): string {
  if (!pathAndQuery.startsWith("/")) {
    throw new Error("launch Location must be origin-relative");
  }
  return pathAndQuery;
}

export function isNativeLaunchLanding(pathname: string): boolean {
  return pathname === LAUNCH_SUCCESS_PATH && !/proof|iam-sso/i.test(pathname);
}
