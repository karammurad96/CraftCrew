/*
 * The supplier base (Wave 12, T190–T195): three levels, listed companies from public registers, claim and removal,
 * the do-not-list register, requests to quote a listed company and the outreach desk.
 * This file holds the rules that need no server state; the routes are in `createSupplierBase` below.
 *
 * Levels (T190): `listed` (imported from a register, no account), `registered` (an account and a company profile,
 * not vetted yet), `vetted` (an admin approved the application). `live` stays on the record and always equals
 * `level === "vetted"`, so the code that only knows `live` keeps working.
 */
const crypto = require("node:crypto");

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

/* ---------- Imports from public registers (T191, T196): clean-up, keys, review batches ---------- */
const COUNTRIES = {
  DEU: "Germany", AUT: "Austria", CHE: "Switzerland", NLD: "Netherlands", BEL: "Belgium", LUX: "Luxembourg",
  FRA: "France", ITA: "Italy", ESP: "Spain", PRT: "Portugal", POL: "Poland", CZE: "Czechia", SVK: "Slovakia",
  HUN: "Hungary", DNK: "Denmark", SWE: "Sweden", FIN: "Finland", NOR: "Norway", IRL: "Ireland", GBR: "United Kingdom",
  SVN: "Slovenia", HRV: "Croatia", ROU: "Romania", BGR: "Bulgaria", GRC: "Greece", EST: "Estonia", LVA: "Latvia", LTU: "Lithuania",
};
// Legal forms (lower case, without dots). A name with none of them looks like a person.
const LEGAL_FORMS = new Set([
  "gmbh", "mbh", "ag", "kg", "kgaa", "ug", "ohg", "se", "ltd", "limited", "llc", "plc", "inc", "sarl", "sas", "sa",
  "srl", "spa", "bv", "nv", "as", "aps", "oy", "ab", "kft", "zrt", "sl", "ev", "sro", "spzoo", "gesellschaft",
]);
// A sole trader (e.K.) is named after a person: never imported (Wave 12 rule 2)
const SOLE_TRADER = new Set(["ek", "ekfm", "ekfr", "ekfrau", "einzelunternehmen"]);
const tokens = (name) =>
  String(name || "")
    .toLowerCase()
    .split(/[\s,;()/]+/)
    .map((x) => x.replace(/\./g, "").replace(/^[^a-z0-9]+|[^a-z0-9&]+$/g, ""))
    .filter(Boolean);
const isCompanyForm = (tok) => LEGAL_FORMS.has(tok) || /^(gmbh|ag|kg)&?co/.test(tok);
// "ACME Anlagenbau GmbH" → "gmbh"; "" when the name has no legal form (it looks like a person) or is a sole trader
function legalFormOf(name) {
  const t = tokens(name);
  if (t.some((x) => SOLE_TRADER.has(x))) return "";
  return t.find(isCompanyForm) || "";
}
const stripAccents = (v) =>
  String(v || "")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
// The name without legal form, accents and punctuation, for comparing
function normName(name) {
  return stripAccents(name)
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((x) => x && !isCompanyForm(x) && !SOLE_TRADER.has(x) && x !== "co" && x !== "and")
    .join(" ");
}
const normPostcode = (v) =>
  String(v || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const normVat = (v) => {
  const x = String(v || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return x.length >= 8 ? x : "";
};
const hashKey = (k) =>
  crypto
    .createHash("sha256")
    .update("craftcrew-listing:" + k)
    .digest("hex");
// The keys of a company: its VAT number (when known) and its normalised name with the post code. Only hashes
// are kept in the do-not-list register (T193).
function keysOf(c) {
  const out = [],
    vat = normVat(c.vatId),
    name = normName(c.company);
  if (vat) out.push(hashKey("vat:" + vat));
  if (name) out.push(hashKey("name:" + name + "|" + normPostcode(c.postcode ?? c.address?.postcode)));
  return out;
}
const initials = (name) =>
  String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "CC";
const categoryList = (v) =>
  [
    ...new Set(
      (Array.isArray(v) ? v : String(v || "").split(/[;|]/))
        .map((x) => String(x).trim())
        .filter(Boolean),
    ),
  ].slice(0, 12);
const text = (v, max = 200) =>
  String(v ?? "")
    .trim()
    .slice(0, max);
function cleanWebsite(v) {
  const w = text(v, 200);
  if (!w) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(w) ? w : "https://" + w);
    return /\./.test(u.hostname) ? u.origin + (u.pathname === "/" ? "" : u.pathname) : "";
  } catch {
    return "";
  }
}
// One candidate as a register gave it → the shape a listing stores, or null when it has no usable name or country
function normaliseCandidate(raw) {
  const company = text(raw?.company ?? raw?.name, 160).replace(/\s+/g, " ");
  const country = text(raw?.country, 3).toUpperCase();
  if (!company || !/^[A-Z]{2,3}$/.test(country)) return null;
  const src = raw.source || {};
  return {
    company,
    legalForm: legalFormOf(company),
    street: text(raw.street, 160),
    postcode: text(raw.postcode, 12),
    city: text(raw.city, 100),
    country,
    website: cleanWebsite(raw.website),
    vatId: normVat(raw.vatId),
    categories: categoryList(raw.categories),
    cpv: categoryList(raw.cpv),
    source: {
      register: text(src.register, 40),
      notice: text(src.notice, 60),
      awardDate: /^\d{4}-\d{2}-\d{2}/.test(String(src.awardDate || "")) ? String(src.awardDate).slice(0, 10) : "",
      url: /^https:\/\//.test(String(src.url || "")) ? text(src.url, 300) : "",
      ...(src.licence ? { licence: text(src.licence, 200) } : {}),
    },
  };
}
// What the platform already has: for each supplier its VAT number, normalised names and post code
function platformKeys(suppliers) {
  return (suppliers || []).map((s) => {
    const cp = s.companyProfile || {},
      address = typeof cp.address === "string" ? cp.address : "";
    return {
      vat: normVat(cp.taxId || cp.vatId || s.vatId),
      names: [...new Set([normName(s.company), normName(cp.legalName)].filter(Boolean))],
      postcode: normPostcode(s.address?.postcode || s.postcode || (address.match(/\b\d{5}\b/) || [])[0]),
    };
  });
}
function onPlatform(c, known) {
  const vat = normVat(c.vatId),
    name = normName(c.company),
    pc = normPostcode(c.postcode);
  return known.some(
    (k) => (vat && k.vat === vat) || (name && k.names.includes(name) && (!pc || !k.postcode || k.postcode === pc)),
  );
}
/* The clean-up of T191 before anything is stored: no persons (no legal form, or a sole trader), nothing on the
   do-not-list register, nothing already on the platform, one entry per company (by VAT number, else by name +
   post code) with the categories merged. `doNotList` is a Set of key hashes. Returns { items, skipped }. */
function cleanCandidates(rawList, { suppliers = [], doNotList = new Set() } = {}) {
  const skipped = { invalid: 0, person: 0, doNotList: 0, existing: 0, duplicate: 0 },
    known = platformKeys(suppliers),
    seen = new Map(),
    items = [];
  for (const raw of rawList || []) {
    const c = normaliseCandidate(raw);
    if (!c) {
      skipped.invalid++;
      continue;
    }
    if (!c.legalForm) {
      skipped.person++;
      continue;
    }
    const keys = keysOf(c);
    if (keys.some((k) => doNotList.has(k))) {
      skipped.doNotList++;
      continue;
    }
    if (onPlatform(c, known)) {
      skipped.existing++;
      continue;
    }
    const hit = keys.map((k) => seen.get(k)).find(Boolean);
    if (hit) {
      skipped.duplicate++;
      hit.categories = [...new Set([...hit.categories, ...c.categories])];
      hit.cpv = [...new Set([...hit.cpv, ...c.cpv])];
      if (!hit.website && c.website) hit.website = c.website;
      if (!hit.vatId && c.vatId) hit.vatId = c.vatId;
      if (c.source.awardDate > (hit.source.awardDate || "")) hit.source = c.source;
      for (const k of keys) seen.set(k, hit);
      continue;
    }
    items.push(c);
    for (const k of keys) seen.set(k, c);
  }
  return { items, skipped };
}
// The review page of a batch: counts per category and city, and a sample of 20
function summarise(batch) {
  const count = (list, pick) => {
    const m = new Map();
    for (const x of list) for (const k of [].concat(pick(x))) if (k) m.set(k, (m.get(k) || 0) + 1);
    return [...m.entries()]
      .map(([name, n]) => ({ name, count: n }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  };
  const items = batch.items || [];
  return {
    id: batch.id,
    status: batch.status,
    source: batch.source,
    createdAt: batch.createdAt,
    publishedAt: batch.publishedAt || null,
    total: items.length,
    skipped: batch.skipped || {},
    byCategory: count(items, (x) => x.categories),
    byCity: count(items, (x) => x.city).slice(0, 30),
    sample: items.slice(0, 20),
  };
}
// Claim codes: 10 letters and digits without the look-alikes (0 O 1 I), shown as XXXXX-XXXXX
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newClaimCode() {
  return [...crypto.randomBytes(10)].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
}
const showCode = (code) => String(code || "").replace(/^(.{5})(.{5})$/, "$1-$2");
const cleanCode = (v) =>
  String(v || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
// A listing as a supplier record (created when its batch is published)
function listingRecord(item, { id, now, batchId }) {
  return {
    id,
    company: item.company,
    location: [item.city, COUNTRIES[item.country] || item.country].filter(Boolean).join(", "),
    address: { street: item.street, postcode: item.postcode, city: item.city, country: item.country },
    website: item.website,
    vatId: item.vatId,
    legalForm: item.legalForm,
    services: item.categories,
    badge: "None",
    rating: 0,
    avatar: initials(item.company),
    experience: 0,
    employees: 0,
    teamMembers: [],
    projectsCompleted: 0,
    certifications: [],
    availability: "Available",
    hourlyRate: 0,
    projectRate: 0,
    description: "",
    reviews: [],
    verified: false,
    level: "listed",
    live: false,
    published: true,
    source: item.source,
    claimCode: newClaimCode(),
    batchId,
    keyHash: keysOf(item),
    listedAt: now,
    touchedAt: now,
    createdAt: now,
  };
}

/* ---------- The routes (admin: import batches) ---------- */
function createSupplierBase(ctx) {
  const { getDb, save, send, body, id, now, activity } = ctx;
  const batches = () => (getDb().supplierImports ||= []);
  const doNotList = () => new Set((getDb().doNotList || []).map((x) => x.hash));
  const MAX_PER_CALL = 5000;

  async function handle(req, res, url, parts, user) {
    const method = req.method,
      db = getDb();
    if (parts[1] === "admin" && parts[2] === "supplier-imports") {
      if (user.role !== "admin") return (send(res, 403, { error: "Admin only" }), true);
      const batch = parts[3] && batches().find((b) => b.id === parts[3]);
      if (!parts[3] && method === "GET")
        return (send(res, 200, { batches: batches().map((b) => ({ ...summarise(b), sample: undefined })) }), true);
      if (!parts[3] && method === "POST") {
        const b = await body(req),
          list = Array.isArray(b.candidates) ? b.candidates : [];
        if (!list.length || list.length > MAX_PER_CALL)
          return (send(res, 400, { error: "Send between 1 and 5000 companies per call" }), true);
        let target = null;
        if (b.batchId) {
          target = batches().find((x) => x.id === b.batchId);
          if (!target) return (send(res, 404, { error: "Import batch not found" }), true);
          if (target.status !== "Review")
            return (send(res, 409, { error: "This import batch was already decided" }), true);
        } else {
          const register = String(b.source?.register || "").trim().slice(0, 40);
          if (!register) return (send(res, 400, { error: "Name the register the companies come from" }), true);
          target = {
            id: id("imp"),
            status: "Review",
            source: {
              register,
              ...(b.source?.licence ? { licence: String(b.source.licence).slice(0, 200) } : {}),
              ...(b.source?.params ? { params: String(b.source.params).slice(0, 300) } : {}),
            },
            items: [],
            skipped: {},
            createdAt: now(),
            createdBy: user.id,
          };
          batches().unshift(target);
        }
        const r = cleanCandidates([...target.items, ...list], { suppliers: db.suppliers, doNotList: doNotList() });
        target.items = r.items;
        for (const [k, n] of Object.entries(r.skipped)) target.skipped[k] = (target.skipped[k] || 0) + n;
        activity(user, `Added ${list.length} companies to import batch ${target.id}`);
        save();
        return (send(res, 201, { batch: summarise(target) }), true);
      }
      if (batch && !parts[4] && method === "GET") return (send(res, 200, { batch: summarise(batch) }), true);
      if (batch && (parts[4] === "publish" || parts[4] === "discard") && method === "POST") {
        if (batch.status !== "Review")
          return (send(res, 409, { error: "This import batch was already decided" }), true);
        if (parts[4] === "discard") {
          Object.assign(batch, { status: "Discarded", items: [], decidedAt: now(), decidedBy: user.id });
          activity(user, `Discarded import batch ${batch.id}`);
          save();
          return (send(res, 200, { batch: summarise(batch) }), true);
        }
        // The register may have changed since the batch was made: clean it again before it goes live
        const r = cleanCandidates(batch.items, { suppliers: db.suppliers, doNotList: doNotList() }),
          stamp = now();
        for (const item of r.items) db.suppliers.push(listingRecord(item, { id: id("sup"), now: stamp, batchId: batch.id }));
        batch.published = r.items.length;
        for (const [k, n] of Object.entries(r.skipped)) batch.skipped[k] = (batch.skipped[k] || 0) + n;
        Object.assign(batch, { status: "Published", publishedAt: stamp, decidedAt: stamp, decidedBy: user.id });
        batch.items = r.items;
        activity(user, `Published import batch ${batch.id}: ${r.items.length} listed companies`);
        save();
        return (send(res, 200, { batch: summarise(batch) }), true);
      }
      return (send(res, 404, { error: "Import batch not found" }), true);
    }
    return false;
  }
  return { handle };
}

module.exports = Object.assign(createSupplierBase, {
  LEVELS,
  levelOf,
  setLevel,
  migrateLevels,
  visibleTo,
  workBlock,
  COUNTRIES,
  legalFormOf,
  normName,
  keysOf,
  hashKey,
  normaliseCandidate,
  cleanCandidates,
  summarise,
  listingRecord,
  newClaimCode,
  showCode,
  cleanCode,
  cleanWebsite,
});
