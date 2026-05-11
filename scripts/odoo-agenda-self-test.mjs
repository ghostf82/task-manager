/**
 * Calls POST /api/dev/odoo-agenda-self-test while `npm run dev` is running.
 * Loads env from .env.local (Supabase + ODOO_AGENDA_SELF_TEST_SECRET).
 *
 * Usage:
 *   node scripts/odoo-agenda-self-test.mjs <user_uuid> <source_event_id> [target_event_id] [mode]
 *
 * Modes: read_probe (default) | slice_table | slice_mail | full_agenda
 * For write modes, pass target_event_id; set TARGET_EVENT_START and SOURCE_EVENT_START env for mail/full.
 *
 * Example:
 *   node scripts/odoo-agenda-self-test.mjs 00000000-0000-0000-0000-000000000000 2635
 *   TARGET_EVENT_START="2026-05-01 07:30:00" SOURCE_EVENT_START="2026-03-26 07:30:00" \
 *     node scripts/odoo-agenda-self-test.mjs <user_uuid> 2635 3378 slice_table
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  const raw = readFileSync(p, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvLocal();

const baseUrl = process.env.SELF_TEST_BASE_URL?.trim() || "http://localhost:3000";
const secret = process.env.ODOO_AGENDA_SELF_TEST_SECRET?.trim();
const userId = process.argv[2];
const sourceEventId = Number(process.argv[3]);
const targetEventId = process.argv[4] != null ? Number(process.argv[4]) : undefined;
const mode = (process.argv[5] || "read_probe").trim();

if (!secret) {
  console.error("Set ODOO_AGENDA_SELF_TEST_SECRET in .env.local");
  process.exit(1);
}
if (!userId || !Number.isFinite(sourceEventId) || sourceEventId <= 0) {
  console.error(
    "Usage: node scripts/odoo-agenda-self-test.mjs <user_uuid> <source_event_id> [target_event_id] [mode]"
  );
  process.exit(1);
}

const body = {
  userId,
  sourceEventId,
  mode,
  ...(Number.isFinite(targetEventId) && targetEventId > 0 ? { targetEventId } : {}),
  ...(process.env.TARGET_EVENT_START ? { targetEventStart: process.env.TARGET_EVENT_START.trim() } : {}),
  ...(process.env.SOURCE_EVENT_START ? { sourceEventStart: process.env.SOURCE_EVENT_START.trim() } : {}),
};

const url = `${baseUrl.replace(/\/$/, "")}/api/dev/odoo-agenda-self-test`;
const res = await fetch(url, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-odoo-self-test-secret": secret,
  },
  body: JSON.stringify(body),
});

const text = await res.text();
let json;
try {
  json = JSON.parse(text);
} catch {
  console.error("Non-JSON response:", text.slice(0, 500));
  process.exit(1);
}

console.log(JSON.stringify(json, null, 2));
if (!json.ok) process.exit(1);
