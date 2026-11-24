/** POST must not 307 (browser would POST the launch body to /dashboard). */
export function launchRedirectStatus(method: string): 303 | 307 {
  return method.toUpperCase() === "POST" ? 303 : 307;
}
