/**
 * Ensures ar.json and en.json define the same dotted leaf string keys.
 * Run: node scripts/check-i18n-parity.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
}

function leafStringPaths(obj, prefix = "") {
  /** @type {string[]} */
  const out = [];
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return out;
  for (const k of Object.keys(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    const v = obj[k];
    if (typeof v === "string") out.push(p);
    else if (v && typeof v === "object" && !Array.isArray(v)) out.push(...leafStringPaths(v, p));
  }
  return out;
}

const ar = readJson("src/messages/ar.json");
const en = readJson("src/messages/en.json");

const a = new Set(leafStringPaths(ar));
const b = new Set(leafStringPaths(en));

const onlyAr = [...a].filter((x) => !b.has(x)).sort();
const onlyEn = [...b].filter((x) => !a.has(x)).sort();

if (onlyAr.length || onlyEn.length) {
  console.error("[i18n:check] ar.json / en.json leaf key mismatch.\n");
  if (onlyAr.length) {
    console.error(`Only in ar (${onlyAr.length}):`);
    onlyAr.forEach((k) => console.error("  ", k));
  }
  if (onlyEn.length) {
    console.error(`Only in en (${onlyEn.length}):`);
    onlyEn.forEach((k) => console.error("  ", k));
  }
  process.exit(1);
}

console.log(`[i18n:check] OK — ${a.size} leaf string keys mirrored in ar & en.`);
