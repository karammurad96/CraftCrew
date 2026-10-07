/*
 * Supplier price rules and automatic confirmation (T244, Wave 16). A supplier agrees in advance, per category:
 * the regions (postcode prefixes or a radius), the largest order value, the earliest start (lead time in days) and
 * the free crew-days (T245). A part of an instant estimate that fits every rule is confirmed at once, at the
 * estimate, with the platform contract accepted in the supplier's name under the stored rule. The acceptance
 * records the rule set's version. Everything is off until an admin switches "Confirm automatically" on in the
 * platform settings (the lawyer's OK is needed first, docs/LEGAL-FACTS.md section 10).
 *
 * Stored on the supplier: priceRules = { version, rules, acceptance, updatedAt, history }.
 */
const geo = require("./geo");
const DAY = 86400000;
const LIMITS = { rules: 30, regions: 30, radiusKm: 3000, maxValue: 10000000, leadDays: 365, crewDays: 1000 };
const key = (s) =>
  String(s || "")
    .trim()
    .toLowerCase();

module.exports = function createPriceRules(ctx) {
  const { getDb, save, send, body, now, activity, clause } = ctx;
  const enabled = () => getDb().settings?.autoConfirm === true;
  const supplierOf = (sid) => getDb().suppliers.find((s) => s.id === sid);

  function clean(input) {
    if (!Array.isArray(input) || input.length > LIMITS.rules)
      return { error: "Price rules: up to 30 rules, one per category." };
    const rules = [],
      seen = new Set();
    for (const x of input) {
      if (!x || typeof x !== "object") return { error: "Price rules: each rule needs a category." };
      const category = String(x.category || "")
        .trim()
        .slice(0, 80);
      if (!category || seen.has(key(category))) return { error: "Price rules: each rule needs its own category." };
      seen.add(key(category));
      const num = (v, max) => {
        if (v === undefined || v === null || v === "") return 0;
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 100) / 100 : null;
      };
      const regions = Array.isArray(x.regions)
        ? x.regions
        : String(x.regions || "")
            .split(/[\s,;]+/)
            .filter(Boolean);
      if (regions.length > LIMITS.regions || regions.some((r) => !/^\d{1,5}$/.test(String(r))))
        return { error: "Price rules: enter regions as postcode prefixes of 1 to 5 digits." };
      const rule = {
        category,
        auto: x.auto === true,
        regions: [...new Set(regions.map(String))],
        radiusKm: num(x.radiusKm, LIMITS.radiusKm),
        maxValue: num(x.maxValue, LIMITS.maxValue),
        leadDays: num(x.leadDays, LIMITS.leadDays),
        freeCrewDays: num(x.freeCrewDays, LIMITS.crewDays),
      };
      if ([rule.radiusKm, rule.maxValue, rule.leadDays, rule.freeCrewDays].some((n) => n === null))
        return { error: "Price rules: enter numbers of at least 0 (lead time up to 365 days, radius up to 3000 km)." };
      rule.leadDays = Math.round(rule.leadDays);
      if (rule.auto && !(rule.maxValue > 0))
        return { error: "Price rules: automatic confirmation needs the largest order value." };
      rules.push(rule);
    }
    return { rules };
  }

  // Does the rule's region allow the site? No region and no radius means anywhere.
  function regionOk(rule, supplier, request) {
    const post = String(request.sitePostcode || "");
    if (!rule.regions.length && !(rule.radiusKm > 0)) return true;
    if (rule.regions.some((p) => post.startsWith(p))) return true;
    if (rule.radiusKm > 0) {
      const site = geo.geocode(post) || geo.geocode(request.siteCity || ""),
        place = geo.geocode(supplier.location || "");
      return !!site && !!place && geo.distanceKm(site, place) <= rule.radiusKm;
    }
    return false;
  }
  // The rule set that confirms a part on its own, or null. Every package of the part needs a matching rule.
  function match(supplierId, part, request, at = Date.now()) {
    if (!enabled()) return null;
    const supplier = supplierOf(supplierId),
      pr = supplier?.priceRules;
    if (!pr?.acceptance || pr.acceptance.hash !== clause.current().hash) return null;
    const start = Date.parse(request.startDate || "") || at;
    for (const pid of part.packageIds) {
      const pkg = (request.packages || []).find((p) => p.id === pid),
        rule = pkg && pr.rules.find((r) => r.auto && key(r.category) === key(pkg.category));
      if (!rule) return null;
      if (!regionOk(rule, supplier, request)) return null;
      if (!(part.supplierAmount <= rule.maxValue)) return null;
      if ((start - at) / DAY < rule.leadDays) return null;
      // T245: the free crew-days of the capacity calendar, once it exists
      if (rule.freeCrewDays > 0 && ctx.freeCrewDays) {
        const free = ctx.freeCrewDays(supplierId, request.startDate, request.dueDate);
        if (free !== null && free !== undefined && free < rule.freeCrewDays) return null;
      }
    }
    return { version: pr.version, acceptance: pr.acceptance };
  }

  const view = (supplier) => ({
    enabled: enabled(),
    version: supplier.priceRules?.version || 0,
    rules: supplier.priceRules?.rules || [],
    accepted: !!supplier.priceRules?.acceptance && supplier.priceRules.acceptance.hash === clause.current().hash,
    updatedAt: supplier.priceRules?.updatedAt || null,
    clause: clause.current(),
  });

  async function handle(req, res, parts, user) {
    if (parts[1] !== "price-rules" || parts[2]) return false;
    if (user.role !== "supplier" || !user.supplierId)
      return (send(res, 403, { error: "Only suppliers set price rules." }), true);
    const supplier = supplierOf(user.supplierId);
    if (!supplier) return (send(res, 404, { error: "Supplier not found" }), true);
    if (req.method === "GET") return (send(res, 200, view(supplier)), true);
    if (req.method !== "PUT") return (send(res, 405, { error: "Method not allowed" }), true);
    const b = await body(req),
      out = clean(b.rules);
    if (out.error) return (send(res, 400, { error: out.error }), true);
    let acceptance = supplier.priceRules?.acceptance;
    if (out.rules.some((r) => r.auto)) {
      if (b.acceptClause !== true)
        return (send(res, 400, { error: "Accept the platform contract to confirm automatically." }), true);
      if (b.clauseHash !== clause.current().hash)
        return (send(res, 409, { error: "The contract terms changed. Read them again and accept them." }), true);
      acceptance = clause.acceptance(user, "price-rule");
    }
    const before = JSON.stringify(supplier.priceRules?.rules || []),
      changed = before !== JSON.stringify(out.rules);
    const pr = (supplier.priceRules ||= { version: 0, rules: [], history: [] });
    if (changed || !pr.version) {
      pr.version = (pr.version || 0) + 1;
      pr.history = [...(pr.history || []), { version: pr.version, at: now(), rules: out.rules }];
    }
    Object.assign(pr, { rules: out.rules, acceptance, updatedAt: now() });
    // Acceptance of a changed set always refers to the new version
    if (pr.acceptance) pr.acceptance = { ...pr.acceptance, ruleVersion: pr.version };
    activity(user, "Changed the price rules");
    save();
    return (send(res, 200, view(supplier)), true);
  }

  return { handle, match, enabled, clean };
};
module.exports.LIMITS = LIMITS;
