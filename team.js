/**
 * Team members: the main account (owner) invites colleagues and decides per area whether they have
 * no access, view-only or full access. Members act within the owner's company data under their own
 * name; the server enforces the limits on every API call.
 */
const locales = require("./locales");
const { BRAND } = locales;

const MODULES = {
  customer: {
    projects: "Projects, phases, tasks and documents",
    sourcing: "Sourcing, offers and contracts",
    invoices: "Invoices and payments",
    time: "Time approvals",
    compliance: "Sites and contractor safety",
    messages: "Messages",
    analytics: "Analytics and reports",
    settings: "Company profile and settings",
  },
  supplier: {
    projects: "Assigned work, progress and documents",
    sourcing: "Bids, quote requests and contracts",
    invoices: "Invoices",
    time: "Time logging",
    compliance: "Compliance: workers, certificates, site access",
    messages: "Messages",
    catalog: "Service catalog and public profile",
    settings: "Company settings and payouts",
  },
};
const LEVELS = ["none", "view", "full"];

/* Which area an API call belongs to. null = always allowed for signed-in members. */
function moduleFor(parts, method) {
  const p1 = parts[1],
    p2 = parts[2];
  if (
    ["dashboard", "notifications", "platform-config", "health", "suppliers", "contacts", "upload"].includes(
      p1,
    )
  )
    return null;
  // Personal rights (password, sessions, GDPR export and deletion) are always the member's own
  if (
    p1 === "auth" ||
    (p1 === "account" && ["password", "sessions", "preferences", "layout", "export", "deletion"].includes(p2))
  )
    return null;
  if (p1 === "profile") return method === "GET" ? null : "settings";
  if (p1 === "account" && p2 === "payout") return "settings";
  if (p1 === "team") return "team";
  if (["projects", "documents", "reviews", "disputes", "deliverables"].includes(p1)) return "projects";
  if (["bids", "rfqs", "contracts", "scorecards", "service-packages"].includes(p1)) return "sourcing";
  if (p1 === "invoices") return "invoices";
  if (p1 === "time-entries") return "time";
  if (["sites", "workers", "compliance", "site-visits"].includes(p1)) return "compliance";
  if (["chats", "messages"].includes(p1)) return "messages";
  if (p1 === "applications" || p1 === "supplier-documents") return "catalog";
  if (p1 === "planning") return "projects";
  return "settings";
}

module.exports = function createTeam(ctx) {
  const {
    getDb,
    save,
    send,
    body,
    id,
    now,
    hashPassword,
    crypto,
    queueEmail,
    issueAuthToken,
    appUrl,
    mailEnabled,
  } = ctx;

  /* Resolves a signed-in member to an acting identity: the owner's data scope with the member's name. */
  function resolve(user) {
    if (!user?.orgOwnerId) return user;
    const owner = getDb().users.find((u) => u.id === user.orgOwnerId && u.status !== "Suspended");
    if (!owner) return null;
    return {
      ...owner,
      id: owner.id,
      name: user.name,
      email: user.email,
      isMember: true,
      memberId: user.id,
      permissions: user.permissions || {},
      notificationPrefs: user.notificationPrefs,
      layouts: user.layouts,
      language: user.language,
      passwordChangedAt: user.passwordChangedAt,
      mustChangePassword: user.mustChangePassword,
      self: user,
    };
  }
  /* 403 message when a member lacks access; null when allowed. */
  function denied(user, parts, method) {
    if (!user?.isMember) return null;
    const mod = moduleFor(parts, method);
    if (mod === null) return null;
    if (mod === "team") return "Only the main account can manage the team";
    const level = user.permissions?.[mod] || "none";
    if (level === "full" || (level === "view" && method === "GET")) return null;
    return level === "view"
      ? `Your team role can view but not change ${MODULES[user.role]?.[mod]?.toLowerCase() || mod}`
      : `Your team role has no access to ${MODULES[user.role]?.[mod]?.toLowerCase() || mod}`;
  }
  const clean = (role, perms) =>
    Object.fromEntries(
      Object.keys(MODULES[role] || {}).map((k) => [k, LEVELS.includes(perms?.[k]) ? perms[k] : "none"]),
    );
  const view = (m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    jobTitle: m.jobTitle || "",
    permissions: m.permissions || {},
    status: m.status || "Active",
    createdAt: m.createdAt,
    lastLoginAt: m.lastLoginAt || null,
    invitePending: !m.passwordChangedAt && !m.lastLoginAt,
  });

  async function handle(req, res, url, parts, user) {
    if (parts[1] !== "team") return false;
    const method = req.method,
      db = getDb();
    if (!["customer", "supplier"].includes(user.role))
      return (send(res, 403, { error: "Teams are available for customer and supplier accounts" }), true);
    if (user.isMember) return (send(res, 403, { error: "Only the main account can manage the team" }), true);
    if (method === "GET" && parts.length === 2)
      return (
        send(res, 200, {
          modules: MODULES[user.role],
          members: db.users.filter((u) => u.orgOwnerId === user.id).map(view),
        }),
        true
      );
    if (method === "POST" && parts.length === 2) {
      const b = await body(req),
        email = ctx.normEmail(b.email),
        name = String(b.name || "").trim();
      if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return (send(res, 400, { error: "Enter a name and a valid email address" }), true);
      if (db.users.some((u) => ctx.normEmail(u.email) === email))
        return (send(res, 409, { error: `This email already has a ${BRAND.name} account` }), true);
      if (db.users.filter((u) => u.orgOwnerId === user.id && u.status !== "Suspended").length >= 50)
        return (send(res, 400, { error: "Team limit reached (50 members)" }), true);
      const temp =
          crypto.randomBytes(9).toString("base64").replace(/[+/=]/g, "").slice(0, 10) +
          "-" +
          crypto.randomInt(10, 99),
        hp = hashPassword(temp);
      const m = {
        id: id("usr"),
        role: user.role,
        orgOwnerId: user.id,
        name: name.slice(0, 120),
        email,
        jobTitle: String(b.jobTitle || "").slice(0, 80),
        company: user.company,
        supplierId: user.supplierId,
        permissions: clean(user.role, b.permissions),
        status: "Active",
        salt: hp.salt,
        passwordHash: hp.hash,
        mustChangePassword: true,
        emailVerified: true,
        language: user.language,
        createdAt: now(),
        invitedBy: user.id,
      };
      db.users.push(m);
      let invite = { temporaryPassword: temp };
      if (mailEnabled()) {
        const token = issueAuthToken(m.id, "reset", 7 * 86400000);
        const lang = locales.langOf(m),
          mail = locales.email("teamInvite", lang, {
            name: m.name,
            sender: user.name,
            company: user.company || locales.text(lang, "server.email.teamInvite.theirCompany"),
            link: `${appUrl()}/#/reset?token=${token}`,
          });
        queueEmail(email, "teamInvite", mail.subject.replace(/[\r\n]+/g, " "), mail.body);
        invite = { emailed: true };
      }
      save();
      return (send(res, 201, { member: view(m), ...invite }), true);
    }
    if (parts[2] && (method === "PATCH" || method === "DELETE")) {
      const m = db.users.find((u) => u.id === parts[2] && u.orgOwnerId === user.id);
      if (!m) return (send(res, 404, { error: "Team member not found" }), true);
      if (method === "DELETE") {
        m.status = "Suspended";
        m.removedAt = now();
        db.sessions = (db.sessions || []).filter((s) => s.userId !== m.id);
        save();
        return (send(res, 200, { member: view(m) }), true);
      }
      const b = await body(req);
      if (b.permissions) m.permissions = clean(user.role, b.permissions);
      if (b.name) m.name = String(b.name).trim().slice(0, 120);
      if (b.jobTitle !== undefined) m.jobTitle = String(b.jobTitle).slice(0, 80);
      if (b.status === "Active" || b.status === "Suspended") {
        m.status = b.status;
        if (b.status === "Suspended") db.sessions = (db.sessions || []).filter((s) => s.userId !== m.id);
      }
      m.updatedAt = now();
      save();
      return (send(res, 200, { member: view(m) }), true);
    }
    return (send(res, 404, { error: "Unknown team action" }), true);
  }

  return { resolve, denied, handle, MODULES, moduleFor };
};
