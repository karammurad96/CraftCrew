/*
 * The served area (T255). Instant estimates (T231) only promise what the supplier base can keep: they are made in
 * the launch region and categories only. A request outside them still reaches the operator (the manual flow) and is
 * counted on a waiting list by region and category, so the admin sees where demand comes from.
 *
 * Settings (admin): `servedRegions`, German postcode prefixes such as "93", "94", "84", and `servedCategories`.
 * Empty means everywhere, so nothing changes until the admin sets them.
 */
const MAX_REGIONS = 100;
const key = (s) =>
  String(s || "")
    .trim()
    .toLowerCase();

// The postcode area a request is counted under: the first two digits, "" when the postcode is missing
const regionOf = (postcode) => {
  const pc = String(postcode || "").replace(/\s/g, "");
  return /^\d{2}/.test(pc) ? pc.slice(0, 2) : "";
};

// Admin input → the list of prefixes, or {error}. Takes an array or a text with commas, spaces or new lines.
function cleanRegions(v) {
  const list = (Array.isArray(v) ? v : String(v ?? "").split(/[\s,;]+/))
    .map((x) => String(x).trim())
    .filter(Boolean);
  if (list.length > MAX_REGIONS || list.some((x) => !/^\d{1,5}$/.test(x))) return { error: true };
  return { regions: [...new Set(list)] };
}
// Admin input → the served categories, each one of the platform's service categories, or {error}
function cleanCategories(v, allowed) {
  const list = (Array.isArray(v) ? v : [])
    .map((x) => String(x).trim())
    .filter(Boolean);
  const known = new Map(allowed.map((c) => [key(c), c]));
  if (list.some((x) => !known.has(key(x)))) return { error: true };
  return { categories: [...new Set(list.map((x) => known.get(key(x))))] };
}

const settingsOf = (settings) => ({
  regions: Array.isArray(settings?.servedRegions) ? settings.servedRegions : [],
  categories: Array.isArray(settings?.servedCategories) ? settings.servedCategories : [],
});

// Is a place and a set of categories inside the served area? Also used to filter companies (T195 outreach desk).
function inside(settings, { postcode = "", categories = [] } = {}) {
  const s = settingsOf(settings),
    pc = String(postcode || "").replace(/\s/g, ""),
    regionOk = !s.regions.length || s.regions.some((p) => pc.startsWith(p)),
    served = new Set(s.categories.map(key)),
    categoryOk = !served.size || categories.every((c) => served.has(key(c)));
  return regionOk && categoryOk;
}

// A request: null when it is inside, else what the waiting list counts (region, categories) and why
function check(settings, request) {
  const categories = [...new Set((request.packages || []).map((p) => p.category).filter(Boolean))];
  if (!categories.length && request.category) categories.push(request.category);
  const s = settingsOf(settings),
    pc = request.sitePostcode || "",
    reasons = [];
  if (!inside({ servedRegions: s.regions }, { postcode: pc })) reasons.push("region");
  if (!inside({ servedCategories: s.categories }, { categories })) reasons.push("category");
  return reasons.length ? { region: regionOf(pc), categories, reasons } : null;
}

// The waiting list: requests outside the served area, counted by region and category, the largest first
function waitingList(requests) {
  const counts = new Map();
  for (const r of requests || [])
    if (r.outsideArea)
      for (const category of r.outsideArea.categories || []) {
        const k = (r.outsideArea.region || "") + "\u0000" + category;
        const row = counts.get(k) || { region: r.outsideArea.region || "", category, count: 0, last: "" };
        row.count++;
        if (String(r.createdAt || "") > row.last) row.last = String(r.createdAt || "");
        counts.set(k, row);
      }
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.region.localeCompare(b.region) || a.category.localeCompare(b.category),
  );
}

module.exports = { regionOf, cleanRegions, cleanCategories, inside, check, waitingList, MAX_REGIONS };
