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
  const { getDb, send, now, projectFor, supplierInvolvement, rateLimited, normEmail } = ctx;

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
    return false;
  }

  return { handle, exportFor, withoutSecrets };
};
