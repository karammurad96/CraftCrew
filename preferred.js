/*
 * Preferred suppliers (T68): a customer's private list of trusted suppliers with a note and tags, plus
 * email invitations for suppliers who are not on CraftCrew yet. An invited company that later gets approved
 * lands on the inviting customer's list. Nobody else ever sees the list, the notes or the tags.
 */
const locales = require("./locales");

module.exports = function createPreferred(ctx) {
  const { getDb, save, send, body, id, now, notify, queueEmail, appUrl, normEmail, rateLimited } = ctx;
  const text = (v, max) =>
    String(v ?? "")
      .trim()
      .slice(0, max);
  const account = (user) => getDb().users.find((u) => u.id === user.id);
  const cleanTags = (tags) =>
    [
      ...new Set(
        (Array.isArray(tags) ? tags : String(tags || "").split(",")).map((t) => text(t, 30)).filter(Boolean),
      ),
    ].slice(0, 10);

  function view(user) {
    const db = getDb(),
      me = account(user);
    return {
      suppliers: (me.preferredSuppliers || [])
        .map((p) => {
          const s = db.suppliers.find((x) => x.id === p.supplierId);
          return (
            s && {
              ...p,
              company: s.company,
              location: s.location || "",
              badge: s.badge || "",
              services: s.services || [],
              live: !!s.live,
            }
          );
        })
        .filter(Boolean),
      invites: (db.supplierInvites || [])
        .filter((i) => i.customerId === me.id)
        .map(({ customerId, ...i }) => i),
    };
  }

  async function handle(req, res, url, parts, user) {
    if (parts[1] !== "preferred-suppliers") return false;
    if (user.role !== "customer")
      return (send(res, 403, { error: "Only customers keep a preferred-supplier list" }), true);
    const db = getDb(),
      me = account(user),
      method = req.method;
    me.preferredSuppliers ||= [];
    if (!parts[2] && method === "GET") return (send(res, 200, view(user)), true);

    // POST /api/preferred-suppliers/invite {email, company, note}
    if (parts[2] === "invite" && method === "POST") {
      const b = await body(req),
        email = normEmail(text(b.email, 200)),
        company = text(b.company, 160),
        note = text(b.note, 2000);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return (send(res, 400, { error: "Enter the supplier's email address" }), true);
      if (!company) return (send(res, 400, { error: "Enter the supplier's company name" }), true);
      if (rateLimited("supplier-invite:" + me.id, 20, 86400000))
        return (send(res, 429, { error: "You can invite up to 20 suppliers a day." }), true);
      const known = db.users.find((u) => normEmail(u.email) === email);
      if (known?.supplierId && db.suppliers.some((s) => s.id === known.supplierId && s.live))
        return (
          send(res, 409, {
            error: "This supplier is already on CraftCrew. Add them from the supplier directory.",
            supplierId: known.supplierId,
          }),
          true
        );
      db.supplierInvites ||= [];
      if (
        db.supplierInvites.some((i) => i.customerId === me.id && i.email === email && i.status === "Invited")
      )
        return (send(res, 409, { error: "You already invited this supplier." }), true);
      const invite = {
        id: id("sinv"),
        customerId: me.id,
        email,
        company,
        note,
        tags: cleanTags(b.tags),
        status: "Invited",
        createdAt: now(),
      };
      db.supplierInvites.push(invite);
      const from = me.companyProfile?.legalName || me.company || me.name;
      // The invited company has no account yet: the email is in the inviter's language
      const m = locales.email("supplierInvite", locales.langOf(me), {
        from,
        company,
        link: `${appUrl()}/#/signup?role=supplier&email=${encodeURIComponent(email)}`,
      });
      queueEmail(email, "supplierInvite", m.subject.replace(/[\r\n]+/g, " "), m.body);
      save();
      const { customerId, ...shown } = invite;
      return (send(res, 201, { invite: shown }), true);
    }

    const sid = parts[2];
    if (sid && sid !== "invite" && !parts[3]) {
      if (method === "PUT") {
        const s = db.suppliers.find((x) => x.id === sid && x.live);
        if (!s) return (send(res, 404, { error: "Supplier not found" }), true);
        const b = await body(req),
          entry = me.preferredSuppliers.find((p) => p.supplierId === sid);
        if (!entry && me.preferredSuppliers.length >= 500)
          return (send(res, 400, { error: "Your list can hold up to 500 suppliers" }), true);
        const fields = {
          note: b.note !== undefined ? text(b.note, 2000) : entry?.note || "",
          tags: b.tags !== undefined ? cleanTags(b.tags) : entry?.tags || [],
          updatedAt: now(),
        };
        if (entry) Object.assign(entry, fields);
        else me.preferredSuppliers.push({ supplierId: sid, addedAt: now(), ...fields });
        save();
        return (send(res, 200, view(user)), true);
      }
      if (method === "DELETE") {
        me.preferredSuppliers = me.preferredSuppliers.filter((p) => p.supplierId !== sid);
        save();
        return (send(res, 200, view(user)), true);
      }
    }
    return false;
  }

  // Called when an application is approved: invitations for that email become preferred-list entries.
  function supplierApproved(supplier, email) {
    const db = getDb();
    for (const invite of db.supplierInvites || []) {
      if (invite.status !== "Invited" || invite.email !== normEmail(email)) continue;
      const customer = db.users.find((u) => u.id === invite.customerId);
      if (!customer) continue;
      customer.preferredSuppliers ||= [];
      if (!customer.preferredSuppliers.some((p) => p.supplierId === supplier.id))
        customer.preferredSuppliers.push({
          supplierId: supplier.id,
          note: invite.note,
          tags: invite.tags || [],
          addedAt: now(),
          updatedAt: now(),
          invited: true,
        });
      Object.assign(invite, { status: "Joined", supplierId: supplier.id, joinedAt: now() });
      notify(
        customer.id,
        { key: "preferredJoined", params: { company: supplier.company } },
        "/customer/preferred",
      );
    }
  }

  const preferredIds = (user) => (account(user)?.preferredSuppliers || []).map((p) => p.supplierId);
  return { handle, supplierApproved, preferredIds };
};
