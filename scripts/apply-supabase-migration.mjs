/**
 * Applies scripts/apply-notifications-migration.sql via Supabase Management API.
 * Requires SUPABASE_ACCESS_TOKEN (Personal Access Token) in .env.local or env.
 * Create at: https://supabase.com/dashboard/account/tokens
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PROJECT_REF = "hihznbzjiszdowouhxis";
const SQL_PATH = resolve(process.cwd(), "scripts/apply-notifications-migration.sql");

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 1) continue;
      const key = t.slice(0, i).trim();
      let val = t.slice(i + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    /* optional */
  }
}

async function main() {
  loadEnvLocal();
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (!token) {
    console.error(
      "Missing SUPABASE_ACCESS_TOKEN. Add a Supabase Personal Access Token to .env.local, then re-run: node scripts/apply-supabase-migration.mjs"
    );
    process.exit(1);
  }

  const query = readFileSync(SQL_PATH, "utf8");
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    }
  );

  const body = await res.text();
  if (!res.ok) {
    console.error("Migration failed:", res.status, body.slice(0, 500));
    process.exit(1);
  }

  console.log("Migration applied successfully.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
