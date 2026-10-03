/**
 * Supplier team planner: a calendar of who works where and when. People are the account owner,
 * invited team members and registered field workers. Entries are job assignments (linked to an
 * assigned project task), absences (vacation, sick leave, training) and other bookings. Approved
 * site visits appear automatically. Overlaps are reported so double bookings are visible.
 */
const TYPES = {
  assignment: "Job assignment",
  vacation: "Vacation",
  sick: "Sick leave",
  training: "Training",
  other: "Other",
};
const ABSENCE = new Set(["vacation", "sick", "training"]);
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));

module.exports = function createPlanning(ctx) {
  const { getDb, save, send, body, id, now, notify } = ctx;
  const list = () => {
    const db = getDb();
    db.planEntries ||= [];
    return db.planEntries;
  };

  const norm = (v) =>
    String(v || "")
      .trim()
      .toLowerCase();
  const sameAsUser = (w, users) => users.find((u) => u && norm(u.name) === norm(w.name));
  /* Worker id → person id, so site visits of a worker who is also a user land on the user's row. */
  function personForWorker(user, workerId) {
    const db = getDb(),
      w = (db.workers || []).find((x) => x.id === workerId),
      u =
        w &&
        sameAsUser(w, [
          db.users.find((x) => x.id === user.id),
          ...db.users.filter((x) => x.orgOwnerId === user.id && x.status !== "Suspended"),
        ]);
    return u ? "usr:" + u.id : "wrk:" + workerId;
  }
  function people(user) {
    const db = getDb(),
      ownerId = user.id;
    const owner = db.users.find((u) => u.id === ownerId);
    const members = db.users.filter((u) => u.orgOwnerId === ownerId && u.status !== "Suspended");
    const workers = (db.workers || []).filter((w) => w.supplierId === user.supplierId && w.active !== false);
    return [
      ...(owner ? [{ id: "usr:" + owner.id, name: owner.name, role: "Account owner", kind: "owner" }] : []),
      ...members.map((m) => ({
        id: "usr:" + m.id,
        name: m.name,
        role: m.jobTitle || "Team member",
        kind: "member",
      })),
      // A worker record of someone who also has a login (e.g. the owner) is the same person.
      ...workers
        .filter((w) => !sameAsUser(w, [owner, ...members]))
        .map((w) => ({ id: "wrk:" + w.id, name: w.name, role: w.role || "Field worker", kind: "worker" })),
    ];
  }
  /* Tasks this supplier is assigned to — the jobs people can be planned on. */
  function jobs(user) {
    const out = [];
    for (const p of getDb().projects)
      for (const ph of p.phases || [])
        for (const t of ph.tasks || [])
          if (
            t.assignedSupplierId === user.supplierId &&
            t.acceptanceStatus === "Accepted" &&
            t.status !== "Completed"
          )
            out.push({
              projectId: p.id,
              projectName: p.name,
              phaseId: ph.id,
              phaseName: ph.name,
              taskId: t.id,
              taskName: t.name,
              startDate: t.startDate || ph.startDate || null,
              dueDate: t.dueDate || ph.dueDate || null,
              status: t.status,
              siteId: p.siteId || null,
            });
    return out;
  }
  const overlaps = (a, b) => a.start <= b.end && b.start <= a.end;
  function conflicts(user, entry, ignoreId) {
    return list()
      .filter(
        (e) =>
          e.supplierId === user.supplierId &&
          e.id !== ignoreId &&
          e.personId === entry.personId &&
          overlaps(e, entry) &&
          (ABSENCE.has(e.type) ||
            ABSENCE.has(entry.type) ||
            (e.type === "assignment" && entry.type === "assignment")),
      )
      .map((e) => ({ id: e.id, type: e.type, title: e.title, start: e.start, end: e.end }));
  }
  function view(e) {
    return { ...e, typeLabel: TYPES[e.type] || e.type };
  }

  async function handle(req, res, url, parts, user) {
    if (parts[1] !== "planning") return false;
    const method = req.method;
    if (user.role !== "supplier" || !user.supplierId)
      return (send(res, 403, { error: "The team planner is available for supplier accounts" }), true);
    const mine = list().filter((e) => e.supplierId === user.supplierId);
    if (method === "GET" && parts.length === 2) {
      const from = isDate(url.searchParams.get("from")) ? url.searchParams.get("from") : "0000-01-01",
        to = isDate(url.searchParams.get("to")) ? url.searchParams.get("to") : "9999-12-31";
      const ppl = people(user),
        inRange = (e) => e.start <= to && e.end >= from;
      const workerIds = new Set(
        (getDb().workers || [])
          .filter((w) => w.supplierId === user.supplierId && w.active !== false)
          .map((w) => w.id),
      );
      // Approved site visits are shown as read-only bookings of the workers going on site.
      const db = getDb(),
        visits = (db.siteVisits || [])
          .filter(
            (v) =>
              v.supplierId === user.supplierId &&
              ["Approved", "Checked in", "Requested"].includes(v.status) &&
              (v.endDate || v.date) >= from &&
              v.date <= to,
          )
          .flatMap((v) =>
            v.workerIds
              .filter((w) => workerIds.has(w))
              .map((w) => ({
                id: `visit:${v.id}:${w}`,
                personId: personForWorker(user, w),
                type: "visit",
                typeLabel: v.status === "Requested" ? "Site access requested" : "Site visit",
                title: (db.sites || []).find((s) => s.id === v.siteId)?.name || "Site visit",
                start: v.date,
                end: v.endDate || v.date,
                readOnly: true,
                status: v.status,
              })),
          );
      const entries = mine.filter(inRange).map(view);
      const clash = new Set();
      for (const e of entries) if (conflicts(user, e, e.id).length) clash.add(e.id);
      return (
        send(res, 200, {
          people: ppl,
          entries: entries.map((e) => ({ ...e, conflict: clash.has(e.id) })),
          visits,
          jobs: jobs(user),
          types: TYPES,
        }),
        true
      );
    }
    if ((method === "POST" && parts.length === 2) || (method === "PATCH" && parts[2])) {
      const b = await body(req),
        existing = parts[2] ? mine.find((e) => e.id === parts[2]) : null;
      if (parts[2] && !existing) return (send(res, 404, { error: "Entry not found" }), true);
      const e = existing
        ? { ...existing }
        : {
            id: id("plan"),
            supplierId: user.supplierId,
            createdBy: user.memberId || user.id,
            createdAt: now(),
          };
      for (const k of ["personId", "type", "title", "start", "end", "note", "projectId", "taskId"])
        if (b[k] !== undefined) e[k] = b[k];
      if (!people(user).some((p) => p.id === e.personId))
        return (send(res, 400, { error: "Choose a person from your team" }), true);
      if (!TYPES[e.type]) return (send(res, 400, { error: "Choose an entry type" }), true);
      if (!isDate(e.start) || !isDate(e.end || e.start))
        return (send(res, 400, { error: "Enter valid dates" }), true);
      e.end = e.end || e.start;
      if (e.end < e.start)
        return (send(res, 400, { error: "The end date must be on or after the start date" }), true);
      if (e.type === "assignment") {
        const job = jobs(user).find((j) => j.taskId === e.taskId);
        if (!job) return (send(res, 400, { error: "Choose one of your assigned tasks" }), true);
        Object.assign(e, {
          projectId: job.projectId,
          projectName: job.projectName,
          taskName: job.taskName,
          title: e.title || job.taskName,
        });
      } else {
        e.projectId = null;
        e.taskId = null;
        e.title = String(e.title || TYPES[e.type]).slice(0, 120);
      }
      e.title = String(e.title).slice(0, 120);
      e.note = String(e.note || "").slice(0, 1000);
      e.updatedAt = now();
      if (existing) Object.assign(existing, e);
      else list().push(e);
      // Tell a team member when they are booked on a job.
      if (
        e.type === "assignment" &&
        e.personId.startsWith("usr:") &&
        e.personId.slice(4) !== (user.memberId || user.id)
      )
        notify(
          e.personId.slice(4),
          { key: "planned", params: { title: e.title, dates: e.start + (e.end !== e.start ? " – " + e.end : "") } },
          "/supplier/planning",
        );
      save();
      return (
        send(res, existing ? 200 : 201, {
          entry: view(existing || e),
          conflicts: conflicts(user, existing || e, e.id),
        }),
        true
      );
    }
    if (method === "DELETE" && parts[2]) {
      const e = mine.find((x) => x.id === parts[2]);
      if (!e) return (send(res, 404, { error: "Entry not found" }), true);
      getDb().planEntries = list().filter((x) => x !== e);
      save();
      return (send(res, 200, { ok: true }), true);
    }
    return (send(res, 404, { error: "Unknown planner action" }), true);
  }
  return { handle, TYPES };
};
