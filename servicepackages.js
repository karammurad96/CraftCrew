/*
 * Service packages (T260, Wave 17). A supplier offers ready-made work at a fixed price, such as "one team, one
 * week on site" or "a PLC programmer from the next working day". Customers browse the active packages (T261) and
 * book them into a project (T262); a booking runs through the platform's confirmation, contract and reveal.
 *
 * Status: Draft → Active ⇄ Paused → Archived. Only vetted, live suppliers activate a package.
 */
const STATUSES = ["Draft", "Active", "Paused", "Archived"];

module.exports = function createServicePackages(ctx) {
  const { getDb, save, send, body, id, now, notify, activity, categories } = ctx;
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

  return { handle, list, find, STATUSES };
};
