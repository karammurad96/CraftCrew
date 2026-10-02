/**
 * GDPR self-service (T120–T122): "Download my data" (Art. 15/20), the account deletion request with a
 * 14-day grace period, and the job that anonymises an account once the grace period is over.
 */

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
  } = ctx;
  const GRACE_DAYS = 14;
  const OPEN_DISPUTE = ["Open", "In progress"];

  /* What still has to be finished before the account can go (T121): the other party needs a counterpart
     until projects, work, invoices and disputes are closed. A team member only removes their own login. */
  function blockers(user) {
    if (user.isMember || user.role === "admin") return [];
    const db = getDb(),
      list = [],
      add = (label, link) => list.push({ label, link });
    if (user.role === "customer") {
      for (const p of db.projects || [])
        if (p.customerId === user.id && !["Completed", "Archived"].includes(p.status) && !p.archived)
          add(`Project "${p.name}" is still ${String(p.status || "open").toLowerCase()}`, `/customer/projects/${p.id}`);
      for (const i of db.invoices || [])
        if (i.customerId === user.id && ["Submitted", "Approved", "Changes Requested"].includes(i.status))
          add(`Invoice ${invoiceNo(i)} is ${i.status === "Approved" ? "approved but not paid" : "not decided yet"}`, `/customer/invoice/${i.id}`);
      for (const d of db.disputes || [])
        if (d.customerId === user.id && OPEN_DISPUTE.includes(d.status)) add("An escalation is still open", "/customer/projects/" + d.projectId);
    }
    if (user.role === "supplier") {
      const sid = user.supplierId;
      for (const p of db.projects || [])
        for (const ph of p.phases || []) {
          if (ph.supplierId === sid && ph.acceptanceStatus === "Accepted" && ph.status !== "Completed")
            add(`Phase "${ph.name}" (${p.name}) is not completed`, `/supplier/projects/${p.id}`);
          for (const t of ph.tasks || [])
            if (t.assignedSupplierId === sid && t.acceptanceStatus === "Accepted" && t.status !== "Completed")
              add(`Task "${t.name}" (${p.name}) is not completed`, `/supplier/projects/${p.id}/tasks/${t.id}`);
        }
      for (const i of db.invoices || [])
        if (i.supplierId === sid && ["Submitted", "Approved", "Changes Requested"].includes(i.status))
          add(`Invoice ${invoiceNo(i)} is not paid yet`, `/supplier/invoice/${i.id}`);
      for (const d of db.disputes || [])
        if (d.supplierId === sid && OPEN_DISPUTE.includes(d.status)) add("An escalation is still open", "/supplier/projects/" + d.projectId);
      for (const v of db.siteVisits || [])
        if (v.supplierId === sid && ["Approved", "Checked in"].includes(v.status))
          add(`A site visit on ${v.date} is still ${v.status === "Approved" ? "planned" : "checked in"}`, "/supplier/compliance");
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
    notify(u.id, "Your account deletion was cancelled because you signed in.", `/${u.role}/profile`);
    queueEmail(
      u.email,
      "deletionCancelled",
      "Your CraftCrew account deletion was cancelled",
      `Hello ${u.name},\n\nyou signed in to CraftCrew, so your account will not be deleted. If you still want to delete it, request it again on your profile page.`,
    );
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
        "This file contains the personal data CraftCrew stores about you (Art. 15 and 20 GDPR). Passwords, two-factor secrets and session tokens are never exported.",
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
        queueEmail(
          self.email,
          "deletionRequested",
          "Your CraftCrew account will be deleted in 14 days",
          `Hello ${self.name},\n\nwe received your request to delete your CraftCrew account. It is locked now and will be deleted on ${after.slice(0, 10)}.\n\nChanged your mind? Sign in before that date and the deletion is cancelled.\n\nInvoices are kept for the legal retention period of 10 years, without your contact details.`,
        );
        save();
        return (send(res, 200, { requestedAt: at, deleteAfter: after }), true);
      }
    }
    return false;
  }

  return { handle, exportFor, withoutSecrets, blockers, cancelOnLogin };
};
