/**
 * GDPR self-service (T120–T122): "Download my data" (Art. 15/20), the account deletion request with a
 * 14-day grace period, and the job that anonymises an account once the grace period is over.
 */
const locales = require("./locales");
const { BRAND } = locales;

// Fields that are never handed out, not even to their owner: password hashes, 2FA secrets, tokens.
const SECRET = /password|salt|totp|secret|recovery|token/i;
function withoutSecrets(value) {
  if (Array.isArray(value)) return value.map(withoutSecrets);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([k]) => !SECRET.test(k))
      .map(([k, v]) => [k, withoutSecrets(v)]),
  );
}

module.exports = function createGdpr(ctx) {
  const {
    getDb,
    save,
    send,
    body,
    now,
    projectFor,
    supplierInvolvement,
    rateLimited,
    normEmail,
    verifyPassword,
    twoFactor,
    queueEmail,
    notify,
    invoiceNo,
    invoiceParties,
    xrechnungData,
    removeUnusedUpload,
    id,
  } = ctx;
  const GRACE_DAYS = 14;
  // An email from server.email of the locale files, in the recipient's language (T137)
  const mail = (to, name, recipient, params) => {
    const m = locales.email(name, locales.langOf(recipient), params);
    queueEmail(to, name, m.subject, m.body);
  };
  const OPEN_DISPUTE = ["Open", "In progress"];

  /* What still has to be finished before the account can go (T121): the other party needs a counterpart
     until projects, work, invoices and disputes are closed. A team member only removes their own login. */
  function blockers(user) {
    if (user.isMember || user.role === "admin") return [];
    const db = getDb(),
      list = [],
      // q: the label as a translation key with its values (prof.del.b.* in the locale files, T136)
      add = (label, link, q) => list.push({ label, link, ...(q ? { q } : {}) });
    if (user.role === "customer") {
      for (const p of db.projects || [])
        if (p.customerId === user.id && !["Completed", "Archived"].includes(p.status) && !p.archived)
          add(`Project "${p.name}" is still ${String(p.status || "open").toLowerCase()}`, `/customer/projects/${p.id}`, ["projectOpen", { name: p.name, status: p.status || "Open" }]);
      for (const i of db.invoices || [])
        if (i.customerId === user.id && ["Submitted", "Approved", "Changes Requested"].includes(i.status))
          add(`Invoice ${invoiceNo(i)} is ${i.status === "Approved" ? "approved but not paid" : "not decided yet"}`, `/customer/invoice/${i.id}`, [
            i.status === "Approved" ? "invoiceApproved" : "invoiceUndecided",
            { number: invoiceNo(i) },
          ]);
      for (const d of db.disputes || [])
        if (d.customerId === user.id && OPEN_DISPUTE.includes(d.status)) add("An escalation is still open", "/customer/projects/" + d.projectId, ["escalationOpen"]);
    }
    if (user.role === "supplier") {
      const sid = user.supplierId;
      for (const p of db.projects || [])
        for (const ph of p.phases || []) {
          if (ph.supplierId === sid && ph.acceptanceStatus === "Accepted" && ph.status !== "Completed")
            add(`Phase "${ph.name}" (${p.name}) is not completed`, `/supplier/projects/${p.id}`, ["phaseOpen", { name: ph.name, project: p.name }]);
          for (const t of ph.tasks || [])
            if (t.assignedSupplierId === sid && t.acceptanceStatus === "Accepted" && t.status !== "Completed")
              add(`Task "${t.name}" (${p.name}) is not completed`, `/supplier/projects/${p.id}/tasks/${t.id}`, ["taskOpen", { name: t.name, project: p.name }]);
        }
      for (const i of db.invoices || [])
        if (i.supplierId === sid && ["Submitted", "Approved", "Changes Requested"].includes(i.status))
          add(`Invoice ${invoiceNo(i)} is not paid yet`, `/supplier/invoice/${i.id}`, ["invoiceNotPaid", { number: invoiceNo(i) }]);
      for (const d of db.disputes || [])
        if (d.supplierId === sid && OPEN_DISPUTE.includes(d.status)) add("An escalation is still open", "/supplier/projects/" + d.projectId, ["escalationOpen"]);
      for (const v of db.siteVisits || [])
        if (v.supplierId === sid && ["Approved", "Checked in"].includes(v.status))
          add(`A site visit on ${v.date} is still ${v.status === "Approved" ? "planned" : "checked in"}`, "/supplier/compliance", [
            v.status === "Approved" ? "visitPlanned" : "visitCheckedIn",
            { date: v.date },
          ]);
    }
    return list;
  }
  // The accounts a request covers: the person, and for a main account its team members too.
  const covered = (self) => [self, ...getDb().users.filter((u) => u.orgOwnerId === self.id && u.status !== "Deleted")];
  /* Signing in during the grace period cancels the request (T121). Returns true when it did. */
  function cancelOnLogin(u) {
    if (!u.deleteAfter) return false;
    for (const x of covered(u)) if (x === u || x.deletionViaOwner) {
      delete x.deletionRequestedAt;
      delete x.deleteAfter;
      delete x.deletionViaOwner;
    }
    notify(u.id, { key: "deletionCancelled" }, `/${u.role}/profile`);
    mail(u.email, "deletionCancelled", u, { name: u.name });
    return true;
  }

  /* Everything CraftCrew stores about this person. A team member gets their own login and what they did;
     the main account also gets the company's records. */
  function exportFor(user) {
    const db = getDb(),
      self = user.self || user,
      main = !user.isMember,
      supplierId = user.role === "supplier" ? user.supplierId : null,
      mine = (list, keep) => (list || []).filter(keep).map(withoutSecrets);
    const projects = (db.projects || [])
      .filter((p) => (user.role === "supplier" ? supplierInvolvement(p, supplierId) : projectFor(user, p.id)))
      .map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        startDate: p.startDate || "",
        dueDate: p.dueDate || "",
        role:
          user.role === "supplier" ? "supplier" : p.customerId === user.id ? "owner" : "shared with you",
        ...(user.role === "supplier"
          ? {
              yourWork: (p.phases || []).flatMap((ph) => [
                ...(ph.supplierId === supplierId ? [{ phase: ph.name, status: ph.status }] : []),
                ...(ph.tasks || [])
                  .filter((t) => t.assignedSupplierId === supplierId)
                  .map((t) => ({ phase: ph.name, task: t.name, status: t.status, acceptance: t.acceptanceStatus })),
              ]),
            }
          : {}),
      }));
    const data = {
      exportedAt: now(),
      about:
        `This file contains the personal data ${BRAND.name} stores about you (Art. 15 and 20 GDPR). Passwords, two-factor secrets and session tokens are never exported.`,
      account: withoutSecrets(self),
      sessions: (db.sessions || [])
        .filter((s) => s.userId === self.id)
        .map((s) => ({ createdAt: s.createdAt, lastSeenAt: s.lastSeenAt || null, expiresAt: s.expiresAt })),
      notifications: mine(db.notifications, (n) => n.userId === self.id),
      messages: mine(
        db.messages,
        (m) => m.senderId === self.id || m.recipientId === self.id || (m.participantIds || []).includes(self.id),
      ),
      activityLog: mine(db.auditLog, (a) => a.actorId === self.id),
      projects,
    };
    if (user.role === "supplier") data.timeEntries = mine(db.timeEntries, (t) => (main ? t.supplierId === supplierId : t.userId === self.id));
    if (main) {
      const uploads = Object.entries(db.uploadOwners || {})
        .filter(([, owner]) => owner === user.id)
        .map(([stored]) => ({ file: stored, url: "/uploads/" + stored }));
      Object.assign(data, { uploads });
      if (user.role === "customer")
        Object.assign(data, {
          invoices: mine(db.invoices, (i) => i.customerId === user.id),
          quoteRequests: mine(db.bids, (b) => b.customerId === user.id),
          directRequests: mine(db.rfqs, (r) => r.customerId === user.id),
          // Requests to the platform (T222), without the operators' working notes
          platformRequests: mine(db.requests, (r) => r.customerId === user.id).map(
            ({ operatorNote, suggestions, ...r }) => r,
          ),
          sites: mine(db.sites, (s) => s.customerId === user.id),
          disputes: mine(db.disputes, (d) => d.customerId === user.id || d.raisedBy === user.id),
        });
      if (user.role === "supplier")
        Object.assign(data, {
          company: withoutSecrets((db.suppliers || []).find((s) => s.id === supplierId) || null),
          invoices: mine(db.invoices, (i) => i.supplierId === supplierId),
          offers: (db.bids || []).flatMap((b) =>
            (b.offers || [])
              .filter((o) => o.supplierId === supplierId)
              .map((o) => withoutSecrets({ ...o, quoteRequest: b.title })),
          ),
          directRequests: mine(db.rfqs, (r) => r.supplierId === supplierId),
          applications: mine(db.applications, (a) => normEmail(a.email) === normEmail(self.email)),
          workers: mine(db.workers, (w) => w.supplierId === supplierId),
          complianceDocuments: mine(db.complianceDocs, (d) => d.supplierId === supplierId),
          siteVisits: mine(db.siteVisits, (v) => v.supplierId === supplierId),
          disputes: mine(db.disputes, (d) => d.supplierId === supplierId),
        });
    }
    return data;
  }

  async function handle(req, res, url, parts, user) {
    if (parts[1] !== "account") return false;
    const method = req.method;
    if (parts[2] === "export" && method === "GET") {
      if (rateLimited("gdpr-export:" + (user.memberId || user.id), 5, 3600000))
        return (send(res, 429, { error: "You can download your data 5 times per hour. Please try again later." }), true);
      const json = JSON.stringify(exportFor(user), null, 2);
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="craftcrew-my-data-${now().slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(json);
      return true;
    }
    if (parts[2] === "deletion" && parts.length === 3) {
      const self = user.self || user;
      if (method === "GET")
        return (
          send(res, 200, {
            blockers: blockers(user),
            requestedAt: self.deletionRequestedAt || null,
            deleteAfter: self.deleteAfter || null,
            graceDays: GRACE_DAYS,
            coversTeam: !user.isMember && covered(self).length > 1,
          }),
          true
        );
      if (method === "POST") {
        if (user.role === "admin")
          return (send(res, 409, { error: "Admin accounts can't be deleted this way. Ask another admin." }), true);
        if (rateLimited("gdpr-delete:" + self.id, 10, 3600000))
          return (send(res, 429, { error: "Too many attempts. Please try again later." }), true);
        const b = await body(req);
        if (!verifyPassword(String(b.password || ""), self))
          return (send(res, 400, { error: "The password is not right." }), true);
        if (twoFactor.enabled(self) && !twoFactor.checkLogin(self, b.code).ok)
          return (send(res, 400, { error: "Enter the current code from your authenticator app.", code: "TOTP_REQUIRED" }), true);
        const open = blockers(user);
        if (open.length)
          return (send(res, 409, { error: "Finish or hand over these first.", blockers: open }), true);
        const db = getDb(),
          at = now(),
          after = new Date(Date.now() + GRACE_DAYS * 86400000).toISOString();
        for (const x of user.isMember ? [self] : covered(self)) {
          x.deletionRequestedAt = at;
          x.deleteAfter = after;
          if (x !== self) x.deletionViaOwner = true;
        }
        const ids = new Set((user.isMember ? [self] : covered(self)).map((x) => x.id));
        db.sessions = (db.sessions || []).filter((s) => !ids.has(s.userId));
        mail(self.email, "deletionRequested", self, { name: self.name, date: after.slice(0, 10) });
        save();
        return (send(res, 200, { requestedAt: at, deleteAfter: after }), true);
      }
    }
    return false;
  }

  /* ---------- The deletion job (T122) ----------
     Runs hourly. Invoices are kept for the legal retention period (§147 AO, §14b UStG), so each invoice of the
     company first gets a frozen copy of its legal details; the deleted side keeps company name, address and
     tax ID (required on an invoice) but loses personal contact details. Then the account is anonymised. */
  function freezeInvoices(u) {
    const db = getDb(),
      side = u.role === "supplier" ? "supplier" : "customer";
    for (const inv of db.invoices || []) {
      const ours = side === "supplier" ? inv.supplierId === u.supplierId : inv.customerId === u.id;
      if (!ours) continue;
      if (!inv.frozenParties) {
        const x = xrechnungData(inv);
        inv.frozenParties = { parties: { ...invoiceParties(inv) }, seller: { ...x.seller }, buyer: { ...x.buyer }, frozenAt: now() };
      }
      const f = inv.frozenParties;
      if (side === "supplier") {
        Object.assign(f.parties, { supplierName: f.parties.supplierCompany, supplierEmail: "", supplierPhone: "" });
        Object.assign(f.seller, { email: "", phone: "", contactName: "" });
      } else {
        Object.assign(f.parties, { customerName: f.parties.customerCompany, customerEmail: "" });
        Object.assign(f.buyer, { email: "" });
      }
    }
  }
  function anonymise(u, main) {
    const db = getDb(),
      at = now();
    if (main) freezeInvoices(u);
    if (main && u.role === "supplier") {
      const s = (db.suppliers || []).find((x) => x.id === u.supplierId);
      if (s) {
        for (const k of Object.keys(s)) if (!["id", "createdAt"].includes(k)) delete s[k];
        Object.assign(s, { company: "Deleted supplier", live: false, verified: false, status: "Deleted", services: [], certifications: [], reviews: [] });
      }
      for (const w of db.workers || [])
        if (w.supplierId === u.supplierId) {
          for (const k of Object.keys(w)) if (!["id", "supplierId", "createdAt"].includes(k)) delete w[k];
          Object.assign(w, { name: "Deleted worker", active: false });
        }
      db.complianceDocs = (db.complianceDocs || []).filter((d) => d.supplierId !== u.supplierId);
      for (const a of db.briefingAcks || []) if (a.supplierId === u.supplierId) a.signatureName = "Deleted";
      for (const a of db.applications || [])
        if (normEmail(a.email) === normEmail(u.email)) {
          for (const k of Object.keys(a)) if (!["id", "status", "createdAt", "updatedAt"].includes(k)) delete a[k];
          Object.assign(a, { company: "Deleted supplier", email: "", deletedAt: at });
        }
    }
    if (main && u.role === "customer")
      for (const s of db.sites || [])
        if (s.customerId === u.id) Object.assign(s, { contactName: "", contactPhone: "", emergencyNumber: "" });
    // Reviews they wrote stay (they describe the supplier's work), without their name
    for (const sup of db.suppliers || [])
      for (const r of sup.reviews || []) if (r.authorId === u.id) r.author = "Deleted user";
    for (const p of db.projects || [])
      if ((p.participantIds || []).includes(u.id)) p.participantIds = p.participantIds.filter((x) => x !== u.id);
    db.notifications = (db.notifications || []).filter((n) => n.userId !== u.id);
    db.sessions = (db.sessions || []).filter((s) => s.userId !== u.id);
    db.authTokens = (db.authTokens || []).filter((t) => t.userId !== u.id);
    db.outbox = (db.outbox || []).filter((m) => normEmail(m.to) !== normEmail(u.email) || m.status === "Sent");
    for (const a of db.auditLog || [])
      if (a.actorId === u.id) Object.assign(a, { actorName: "Deleted user", actorEmail: u.id });
    const email = u.email;
    for (const k of Object.keys(u)) if (!["id", "role", "supplierId", "orgOwnerId", "createdAt"].includes(k)) delete u[k];
    Object.assign(u, {
      name: "Deleted user",
      email: `deleted-${u.id}@invalid`,
      company: main ? (u.role === "supplier" ? "Deleted supplier" : "Deleted company") : undefined,
      status: "Deleted",
      deletedAt: at,
    });
    if (!main) delete u.company;
    // Files nobody else's kept record points to any more
    for (const [stored, owner] of Object.entries(db.uploadOwners || {}))
      if (owner === u.id) removeUnusedUpload("/uploads/" + stored);
    db.auditLog ||= [];
    db.auditLog.unshift({
      id: id("aud"),
      at,
      actorId: u.id,
      actorName: "Deleted user",
      actorEmail: u.id,
      actorRole: u.role,
      action: "Account deleted",
      method: "JOB",
      path: "gdpr/deletion",
      entityId: u.id,
      status: "Deleted",
      projectId: null,
      projectName: "",
    });
    return email;
  }
  function runDeletions(at = Date.now()) {
    const db = getDb(),
      due = (db.users || []).filter((u) => u.deleteAfter && u.status !== "Deleted" && Date.parse(u.deleteAfter) <= at);
    if (!due.length) return 0;
    // Main accounts first: their team members go with them
    due.sort((a, b) => Number(!!a.orgOwnerId) - Number(!!b.orgOwnerId));
    for (const u of due) if (u.status !== "Deleted") anonymise(u, !u.orgOwnerId);
    save();
    return due.length;
  }

  return { handle, exportFor, withoutSecrets, blockers, cancelOnLogin, runDeletions };
};
