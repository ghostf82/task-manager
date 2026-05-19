/**
 * Smoke test for Odoo task UI mapping helpers (no live Odoo call).
 * Run: node scripts/test-odoo-task-enrich.mjs
 */

function readOdooMany2oneId(value) {
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === "number") return Number(value[0]);
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  return 0;
}

function readOdooMany2onePair(value) {
  if (value === false || value == null) return { id: null, name: "" };
  if (Array.isArray(value)) {
    const id = readOdooMany2oneId(value);
    const name = value.length > 1 && typeof value[1] === "string" ? value[1].trim() : "";
    return { id: id > 0 ? id : null, name };
  }
  const id = readOdooMany2oneId(value);
  return { id: id > 0 ? id : null, name: "" };
}

const stage = readOdooMany2onePair([12, "قيد التنفيذ"]);
const bare = readOdooMany2onePair(7);
const missing = readOdooMany2onePair(false);

if (stage.id !== 12 || stage.name !== "قيد التنفيذ") {
  console.error("FAIL stage pair", stage);
  process.exit(1);
}
if (bare.id !== 7 || bare.name !== "") {
  console.error("FAIL bare id", bare);
  process.exit(1);
}
if (missing.id !== null) {
  console.error("FAIL false", missing);
  process.exit(1);
}

console.log("OK — many2one parsing for Odoo task enrichment");
