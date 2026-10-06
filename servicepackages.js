/*
 * Service packages (T260, Wave 17). A supplier offers ready-made work at a fixed price, such as "one team, one
 * week on site" or "a PLC programmer from the next working day". Customers browse the active packages (T261) and
 * book them into a project (T262); a booking runs through the platform's confirmation, contract and reveal.
 *
 * Status: Draft → Active ⇄ Paused → Archived. Only vetted, live suppliers activate a package.
 */
const geo = require("./geo");
const STATUSES = ["Draft", "Active", "Paused", "Archived"];
const DAY = 86400000;

module.exports = function createServicePackages(ctx) {
  const { getDb, save, send, body, id, now, notify, activity, categories } = ctx;
  const { customerPrice, anonymousProfile, platformMode } = ctx;
  const text = (v, max) =>
    String(v ?? "")
      .trim()
      .slice(0, max);
  const list = () => (getDb().servicePackages ||= []);
  const supplierOf = (user) => getDb().suppliers.find((s) => s.id === user.supplierId);
  const int = (v, min, max) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= min && n <= max ? n : null;
  };

  // The fields a supplier sends; returns {error} or {fields}
  function clean(b) {
    const title = text(b.title, 120),
      description = text(b.description, 3000);
    if (title.length < 3) return { error: "Give the package a title." };
    if (description.length < 10) return { error: "Describe the package in a few sentences." };
    const category = text(b.category, 80);
    if (!categories().includes(category)) return { error: "Choose a category from the list." };
    const included = (Array.isArray(b.included) ? b.included : String(b.included || "").split("\n"))
      .map((x) => text(x, 200))
      .filter(Boolean);
    if (included.length > 15) return { error: "List up to 15 things that are included." };
    const teamSize = int(b.teamSize, 1, 50),
      days = int(b.days, 1, 60),
      leadDays = int(b.leadDays, 1, 60),
      perWeek = int(b.perWeek ?? 1, 1, 20);
    if (teamSize === null) return { error: "Enter the team size (1 to 50 people)." };
    if (days === null) return { error: "Enter the days on site (1 to 60 working days)." };
    if (leadDays === null) return { error: "Enter the earliest start in working days (1 to 60)." };
    if (perWeek === null) return { error: "Enter how many bookings you can start per week (1 to 20)." };
    const price = Math.round(Number(b.price) * 100) / 100;
    if (!Number.isFinite(price) || price < 50 || price > 5000000)
      return { error: "Enter the fixed price in euros (at least 50)." };
    // Where the supplier works: postcode prefixes, or a radius around its location
    const regions = [
      ...new Set(
        (Array.isArray(b.regions) ? b.regions : String(b.regions || "").split(/[\s,;]+/))
          .map((x) => String(x).trim())
          .filter(Boolean),
      ),
    ];
    if (regions.length > 30 || regions.some((r) => !/^\d{1,5}$/.test(r)))
      return { error: "Enter the regions as postcode beginnings, for example 93, 94, 84." };
    let radiusKm = null;
    if (b.radiusKm !== undefined && b.radiusKm !== null && b.radiusKm !== "") {
      radiusKm = int(b.radiusKm, 1, 2000);
      if (radiusKm === null) return { error: "Enter the radius in km (1 to 2,000), or leave it empty." };
    }
    return {
      fields: {
        title,
        description,
        category,
        included,
        teamSize,
        days,
        leadDays,
        perWeek,
        price,
        regions,
        radiusKm,
        travelIncluded: !!b.travelIncluded,
        exclusions: text(b.exclusions, 1000),
      },
    };
  }
  // A supplier may publish only when vetted and live
  const canPublish = (s) => !!s?.live;
  function bookings(pkg) {
    return (getDb().requests || []).filter((r) => r.servicePackageId === pkg.id);
  }
  const openBookings = (pkg) => bookings(pkg).filter((r) => ["New", "Chosen"].includes(r.status));
  // The supplier's and the admin's view: everything, plus the booking counts
  function own(pkg) {
    const all = bookings(pkg);
    return {
      ...pkg,
      bookings: all.length,
      openBookings: all.filter((r) => r.status === "Chosen").length,
      contracted: all.filter((r) => r.status === "Contracted").length,
    };
  }
  function find(pid) {
    return list().find((p) => p.id === pid);
  }

  /* ---------- T261: the shop ---------- */
  const isoDay = (d) => d.toISOString().slice(0, 10);
  const weekend = (d) => d.getUTCDay() === 0 || d.getUTCDay() === 6;
  function addWorkingDays(from, n) {
    const d = new Date(from);
    while (n > 0) {
      d.setUTCDate(d.getUTCDate() + 1);
      if (!weekend(d)) n--;
    }
    return d;
  }
  // The Monday of a date's week (YYYY-MM-DD)
  function weekOf(day) {
    const d = new Date(day + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return isoDay(d);
  }
  // Bookings that hold a slot: waiting for the supplier or contracted
  const holding = (pkg) =>
    bookings(pkg).filter((r) => ["Chosen", "Contracted"].includes(r.status) && r.servicePackageId === pkg.id);
  function weekFull(pkg, day) {
    const w = weekOf(day);
    return holding(pkg).filter((r) => weekOf(r.startDate) === w).length >= pkg.perWeek;
  }
  // The earliest start: the lead time in working days, then the first week with a free slot (T261)
  function earliestStart(pkg, today = new Date()) {
    let d = addWorkingDays(new Date(isoDay(today) + "T00:00:00Z"), pkg.leadDays);
    for (let i = 0; i < 60 && weekFull(pkg, isoDay(d)); i++) {
      d = new Date(weekOf(isoDay(d)) + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + 7);
    }
    return isoDay(d);
  }
  const supplierAvailable = (s) => !!s?.live && !["Busy", "Unavailable"].includes(s.availability);
  // Does the package's supplier work at this postcode? Unknown places are not excluded.
  function serves(pkg, postcode) {
    const pc = String(postcode || "").trim();
    if (!pc) return true;
    if (pkg.regions?.length) return pkg.regions.some((r) => pc.startsWith(r));
    if (!pkg.radiusKm) return true;
    const s = getDb().suppliers.find((x) => x.id === pkg.supplierId),
      site = geo.geocode(pc),
      home = geo.geocode(s?.location || "");
    return !site || !home || geo.distanceKm(site, home) <= pkg.radiusKm;
  }
  function shopList() {
    const db = getDb();
    return list().filter(
      (p) => p.status === "Active" && supplierAvailable(db.suppliers.find((s) => s.id === p.supplierId)),
    );
  }
  // What a customer sees: in brokered mode the anonymised profile, never the company (T224)
  function shopView(pkg) {
    const out = {
      id: pkg.id,
      title: pkg.title,
      description: pkg.description,
      category: pkg.category,
      included: pkg.included || [],
      teamSize: pkg.teamSize,
      days: pkg.days,
      leadDays: pkg.leadDays,
      regions: pkg.regions || [],
      radiusKm: pkg.radiusKm || null,
      travelIncluded: !!pkg.travelIncluded,
      exclusions: pkg.exclusions || "",
      price: customerPrice(pkg.price),
      earliestStart: earliestStart(pkg),
      profile: anonymousProfile(pkg.supplierId),
    };
    if (platformMode() === "marketplace") {
      const s = getDb().suppliers.find((x) => x.id === pkg.supplierId);
      Object.assign(out, { supplierId: pkg.supplierId, company: s?.company || "" });
    }
    return out;
  }
  const START_WITHIN = { next: 1, week: 7, "2weeks": 14 };
  function shop(q) {
    const today = new Date(),
      cat = q.get("category") || "",
      start = q.get("start") || "",
      postcode = q.get("postcode") || "",
      maxPrice = Number(q.get("maxPrice")) || 0,
      text = String(q.get("q") || "")
        .trim()
        .toLowerCase(),
      sort = q.get("sort") || "start";
    const limit =
      start === "next" ? isoDay(addWorkingDays(today, 1)) : START_WITHIN[start] ? isoDay(new Date(Date.now() + START_WITHIN[start] * DAY)) : null;
    return shopList()
      .filter((p) => !cat || p.category === cat)
      .filter((p) => serves(p, postcode))
      .filter((p) => !text || (p.title + " " + p.description + " " + (p.included || []).join(" ")).toLowerCase().includes(text))
      .map(shopView)
      .filter((v) => !maxPrice || v.price <= maxPrice)
      .filter((v) => !limit || v.earliestStart <= limit)
      .sort((a, b) =>
        sort === "price"
          ? a.price - b.price
          : sort === "rating"
            ? (b.profile.rating || 0) - (a.profile.rating || 0) || a.price - b.price
            : a.earliestStart.localeCompare(b.earliestStart) || a.price - b.price,
      );
  }

  async function handle(req, res, url, parts, user) {
    if (parts[1] !== "service-packages") return false;
    const method = req.method;
    const pkg = parts[2] && find(parts[2]);

    // ---- supplier: own packages ----
    if (user.role === "supplier") {
      const supplier = supplierOf(user);
      if (!supplier) return (send(res, 403, { error: "Only suppliers offer packages." }), true);
      const mine = list().filter((p) => p.supplierId === supplier.id);
      if (!parts[2] && method === "GET")
        return (
          send(res, 200, { packages: mine.map(own), canPublish: canPublish(supplier), categories: categories() }),
          true
        );
      if (!parts[2] && method === "POST") {
        const { error, fields } = clean(await body(req));
        if (error) return (send(res, 400, { error }), true);
        if (mine.filter((p) => p.status !== "Archived").length >= 50)
          return (send(res, 400, { error: "You can offer up to 50 packages." }), true);
        const p = {
          id: id("spk"),
          supplierId: supplier.id,
          ...fields,
          status: "Draft",
          createdAt: now(),
          updatedAt: now(),
        };
        list().unshift(p);
        activity(user, `Created package ${p.title}`);
        save();
        return (send(res, 201, { package: own(p) }), true);
      }
      if (!pkg || pkg.supplierId !== supplier.id) return (send(res, 404, { error: "Package not found" }), true);
      if (!parts[3] && method === "GET") return (send(res, 200, { package: own(pkg) }), true);
      if (!parts[3] && method === "PUT") {
        if (pkg.status === "Archived")
          return (send(res, 409, { error: "An archived package can no longer be changed." }), true);
        const { error, fields } = clean(await body(req));
        if (error) return (send(res, 400, { error }), true);
        Object.assign(pkg, fields, { updatedAt: now() });
        activity(user, `Changed package ${pkg.title}`);
        save();
        return (send(res, 200, { package: own(pkg) }), true);
      }
      if (parts[3] === "status" && !parts[4] && method === "POST") {
        const b = await body(req),
          status = String(b.status || "");
        if (!["Active", "Paused", "Archived"].includes(status))
          return (send(res, 400, { error: "Choose a valid status for the package." }), true);
        if (pkg.status === "Archived")
          return (send(res, 409, { error: "An archived package can no longer be changed." }), true);
        if (status === "Active") {
          if (!canPublish(supplier))
            return (send(res, 409, { error: "Your company must be vetted before packages go live." }), true);
          if (pkg.pausedByAdmin)
            return (
              send(res, 409, { error: "The platform paused this package. Change it and contact the platform." }),
              true
            );
        }
        if (status === "Archived" && openBookings(pkg).length)
          return (send(res, 409, { error: "Answer the open bookings of this package first." }), true);
        Object.assign(pkg, { status, updatedAt: now() });
        activity(user, `Package ${pkg.title}: ${status}`);
        save();
        return (send(res, 200, { package: own(pkg) }), true);
      }
      if (!parts[3] && method === "DELETE") {
        if (bookings(pkg).length)
          return (send(res, 409, { error: "A package with bookings cannot be deleted. Archive it instead." }), true);
        getDb().servicePackages = list().filter((p) => p.id !== pkg.id);
        activity(user, `Deleted package ${pkg.title}`);
        save();
        return (send(res, 200, { ok: true }), true);
      }
      return (send(res, 404, { error: "Package not found" }), true);
    }

    // ---- customer: the shop (T261) ----
    if (user.role === "customer") {
      if (!parts[2] && method === "GET")
        return (send(res, 200, { packages: shop(url.searchParams), categories: categories() }), true);
      const live = pkg && shopList().includes(pkg);
      if (!live || parts.length !== 3 || method !== "GET")
        return (send(res, 404, { error: "Package not found" }), true);
      return (send(res, 200, { package: shopView(pkg) }), true);
    }

    // ---- admin: every package; pause with a reason, or release the pause ----
    if (user.role === "admin") {
      const db = getDb(),
        company = (sid) => db.suppliers.find((s) => s.id === sid)?.company || "";
      if (!parts[2] && method === "GET")
        return (send(res, 200, { packages: list().map((p) => ({ ...own(p), company: company(p.supplierId) })) }), true);
      if (!pkg) return (send(res, 404, { error: "Package not found" }), true);
      if (parts[3] === "moderate" && !parts[4] && method === "POST") {
        const b = await body(req);
        if (b.action === "pause") {
          const reason = text(b.reason, 1000);
          if (!reason) return (send(res, 400, { error: "Tell the supplier why the package is paused." }), true);
          Object.assign(pkg, { status: "Paused", pausedByAdmin: { reason, at: now(), by: user.id }, updatedAt: now() });
          for (const u of db.users.filter((x) => x.supplierId === pkg.supplierId))
            notify(u.id, { key: "packagePaused", params: { title: pkg.title, reason } }, "/supplier/packages");
        } else if (b.action === "release") {
          delete pkg.pausedByAdmin;
          pkg.updatedAt = now();
        } else return (send(res, 400, { error: "Choose a valid action for this package." }), true);
        activity(user, `Package ${pkg.title}: ${b.action}`);
        save();
        return (send(res, 200, { package: { ...own(pkg), company: company(pkg.supplierId) } }), true);
      }
      return (send(res, 404, { error: "Package not found" }), true);
    }
    return false;
  }

  return { handle, list, find, earliestStart, weekFull, serves, shopList, addWorkingDays, STATUSES };
};
