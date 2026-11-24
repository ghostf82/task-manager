import { LAUNCH_SUCCESS_PATH } from "./contract";

/** POST must not 307 (browser would POST the launch body to the dashboard). */
export function launchRedirectStatus(method: string): 303 | 307 {
  return method.toUpperCase() === "POST" ? 303 : 307;
}

export function isNativeLaunchLanding(pathname: string): boolean {
  return pathname === LAUNCH_SUCCESS_PATH && !/proof|iam-sso/i.test(pathname);
}
