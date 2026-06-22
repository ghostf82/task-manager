/**
 * Client-safe Odoo URL roots for instances hosted at `https://host/odoo` (Odoo 17+).
 *
 * - `appRoot` → SPA apps: `/odoo/documents`, `/odoo/calendar`, `/odoo/action-883`
 * - `webRoot` → legacy web: `/web/content`, `/web#...` (must NOT be under `/odoo/`)
 */

export type OdooUrlBases = {
  /** e.g. https://alomraniah.odoo.com */
  origin: string;
  /** e.g. https://alomraniah.odoo.com/odoo */
  appRoot: string;
  /** e.g. https://alomraniah.odoo.com — for /web/* only */
  webRoot: string;
};

export function parseOdooUrlBases(baseUrl: string): OdooUrlBases {
  let t = String(baseUrl ?? "").trim().replace(/\/+$/g, "");
  if (!t) {
    return { origin: "", appRoot: "", webRoot: "" };
  }
  t = t.replace(/\/web$/i, "");
  t = t.replace(/(?:\/odoo)+$/i, "/odoo");

  const webRoot = t.replace(/\/odoo$/i, "") || t;
  const appRoot = /\/odoo$/i.test(t) ? t : `${t}/odoo`;

  let origin = webRoot;
  try {
    origin = new URL(webRoot).origin;
  } catch {
    origin = webRoot;
  }

  return { origin, appRoot, webRoot };
}
