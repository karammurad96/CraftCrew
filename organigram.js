/*
 * Project organigram (T263, Wave 17): who works on a project. The customer at the top with their team, the
 * platform's coordinator in a brokered project, and each supplier company with its contact, the categories and
 * tasks it handles, and its people (team members and workers planned on its tasks or going to the site).
 *
 * The customer and the admin see every company; a supplier sees the customer's side, the platform and its own
 * company, never another supplier's people (T10).
 */
module.exports = function createOrganigram(ctx) {
  const { getDb, send, projectFor, projectSupplierIds, platformEmail } = ctx;

  const person = (u, role) => ({ id: u.id, name: u.name || "", role: role || u.jobTitle || "" });
  const canSeeProjects = (u) => (u.permissions?.projects || "none") !== "none";

  function customerSide(p) {
    const db = getDb(),
      owner = db.users.find((u) => u.id === p.customerId);
    if (!owner) return null;
    const members = db.users
      .filter((u) => u.orgOwnerId === owner.id && u.status !== "Suspended" && canSeeProjects(u))
      .map((u) => ({ ...person(u), access: u.permissions.projects }));
    const shared = (p.participantIds || [])
      .map((pid) => db.users.find((u) => u.id === pid))
      .filter(Boolean)
      .map((u) => ({ ...person(u), company: u.company || "", shared: true }));
    return {
      company: owner.company || "",
      owner: person(owner, owner.jobTitle || ""),
      members,
      shared,
    };
  }

  function platformSide(p) {
    if (!p.brokered) return null;
    const op = p.operatorId && getDb().users.find((u) => u.id === p.operatorId);
    return { name: op?.name || "", email: platformEmail() };
  }

  // The category of each task: from the request package that created it, else from its quote request
  function taskCategories(p) {
    const db = getDb(),
      map = new Map();
    for (const r of db.requests || [])
      if (r.projectId === p.id) for (const x of r.packages || []) if (x.taskId) map.set(x.taskId, x.category);
    for (const b of db.bids || []) if (b.projectId === p.id && b.taskId && b.category && !map.has(b.taskId)) map.set(b.taskId, b.category);
    return map;
  }

  function supplierNode(p, sid, cats) {
    const db = getDb(),
      s = db.suppliers.find((x) => x.id === sid);
    if (!s) return null;
    const tasks = [];
    for (const ph of p.phases || [])
      for (const t of ph.tasks || [])
        if (
          (t.assignedSupplierId === sid && t.acceptanceStatus === "Accepted") ||
          (ph.supplierId === sid && ph.acceptanceStatus !== "Declined")
        )
          tasks.push({ id: t.id, name: t.name, phase: ph.name, status: t.status || "Not Started", category: cats.get(t.id) || "" });
    const users = db.users.filter((u) => u.supplierId === sid && u.status !== "Suspended"),
      owner = users.find((u) => !u.orgOwnerId) || users[0];
    // People: team members and workers, with the tasks they are planned on here
    const people = new Map(),
      taskName = new Map(tasks.map((x) => [x.id, x.name])),
      add = (key, base, task) => {
        if (!people.has(key)) people.set(key, { ...base, tasks: [] });
        if (task && !people.get(key).tasks.includes(task)) people.get(key).tasks.push(task);
      };
    for (const e of db.planEntries || [])
      if (e.supplierId === sid && e.projectId === p.id && e.type === "assignment") {
        const [kind, pid] = String(e.personId || "").split(":"),
          base =
            kind === "usr"
              ? (() => {
                  const u = db.users.find((x) => x.id === pid);
                  return u && { id: "usr:" + u.id, name: u.name, role: u.jobTitle || "", kind: "member" };
                })()
              : (() => {
                  const w = (db.workers || []).find((x) => x.id === pid && x.supplierId === sid);
                  return w && { id: "wrk:" + w.id, name: w.name, role: w.role || "", kind: "worker" };
                })();
        if (base) add(base.id, base, taskName.get(e.taskId) || e.taskName || "");
      }
    for (const v of db.siteVisits || [])
      if (v.supplierId === sid && p.siteId && v.siteId === p.siteId && v.status !== "Rejected")
        for (const wid of v.workerIds || []) {
          const w = (db.workers || []).find((x) => x.id === wid);
          if (w) add("wrk:" + w.id, { id: "wrk:" + w.id, name: w.name, role: w.role || "", kind: "worker", onSite: true }, "");
          if (w) people.get("wrk:" + w.id).onSite = true;
        }
    const categories = [...new Set(tasks.map((x) => x.category).filter(Boolean))];
    return {
      supplierId: sid,
      company: s.company || "",
      badge: s.badge || "",
      contact: owner ? { name: owner.name || "", role: owner.jobTitle || "" } : null,
      categories: categories.length ? categories : (s.services || []).slice(0, 3),
      tasks,
      people: [...people.values()].map((x) => ({ ...x, tasks: x.tasks.filter(Boolean) })),
    };
  }

  function build(user, p) {
    const cats = taskCategories(p),
      ids = projectSupplierIds(p).filter((sid) => user.role !== "supplier" || sid === user.supplierId);
    return {
      project: { id: p.id, name: p.name, status: p.status, brokered: !!p.brokered },
      customer: customerSide(p),
      platform: platformSide(p),
      suppliers: ids.map((sid) => supplierNode(p, sid, cats)).filter(Boolean),
    };
  }

  async function handle(req, res, url, parts, user) {
    if (parts[1] !== "projects" || parts[3] !== "organigram" || parts.length !== 4 || req.method !== "GET") return false;
    const p = projectFor(user, parts[2]);
    if (!p) return (send(res, 404, { error: "Project not found" }), true);
    return (send(res, 200, { organigram: build(user, p) }), true);
  }

  return { handle, build };
};
