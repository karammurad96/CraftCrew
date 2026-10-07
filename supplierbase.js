/*
 * The supplier base (Wave 12, T190–T195): three levels, listed companies from public registers, claim and removal,
 * the do-not-list register, requests to quote a listed company and the outreach desk.
 * This file holds the rules that need no server state; the routes are in `createSupplierBase` below.
 *
 * Levels (T190): `listed` (imported from a register, no account), `registered` (an account and a company profile,
 * not vetted yet), `vetted` (an admin approved the application). `live` stays on the record and always equals
 * `level === "vetted"`, so the code that only knows `live` keeps working.
 */
const LEVELS = ["listed", "registered", "vetted"];

// The level of a supplier record; records from before T190 have none, so it follows `live`
const levelOf = (s) => (LEVELS.includes(s?.level) ? s.level : s?.live ? "vetted" : "registered");

// Gives a record its level and keeps `live` in step with it
function setLevel(s, level) {
  s.level = level;
  s.live = level === "vetted";
  return s;
}

// The start-up migration: every supplier gets a level (live → vetted, an account's placeholder → registered)
function migrateLevels(db) {
  let changed = false;
  for (const s of db.suppliers || []) {
    const level = levelOf(s);
    if (s.level !== level || s.live !== (level === "vetted")) {
      setLevel(s, level);
      changed = true;
    }
  }
  return changed;
}

// May the viewer see this supplier in the directory? Listed companies are for signed-in customers (and admins) only,
// and only once their import batch is published. A registered one needs a company profile (a name and a service).
function visibleTo(s, viewer) {
  if (!s || s.status === "Deleted") return false;
  const level = levelOf(s);
  if (level === "vetted") return true;
  if (level === "registered") return !!(String(s.company || "").trim() && (s.services || []).length);
  return s.published !== false && (viewer?.role === "customer" || viewer?.role === "admin");
}

// Could this supplier be given work? null when yes, else the reason: "listed" (never) or "notVetted" (needs the
// customer's confirmation, `confirmNotVetted: true`)
function workBlock(s, body) {
  const level = levelOf(s);
  if (level === "listed") return "listed";
  if (level === "registered" && body?.confirmNotVetted !== true) return "notVetted";
  return null;
}

module.exports = { LEVELS, levelOf, setLevel, migrateLevels, visibleTo, workBlock };
