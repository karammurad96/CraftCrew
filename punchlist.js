/*
 * Punch list (T64): defects per task. The customer records them, the supplier marks them fixed with a
 * photo, the customer verifies them (or reopens them). Every change notifies the other party, and open
 * defects appear in the acceptance report (T63).
 */
const SEVERITIES = ["minor", "major", "critical"];
const MAX_DEFECTS = 200;

module.exports = function createPunchList(ctx) {
  const { getDb, save, send, body, id, now, notify, projectFor, ownUpload, activity } = ctx;
  const validDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + "T00:00:00Z"));
  const text = (v, max) =>
    String(v ?? "")
      .trim()
      .slice(0, max);

  function findTask(project, taskId) {
    for (const phase of project?.phases || [])
      for (const task of phase.tasks || []) if (task.id === taskId) return { phase, task };
    return {};
  }
  // Photos must be the sender's own uploads; at most five per step.
  function photos(user, list) {
    const urls = [...new Set(Array.isArray(list) ? list : [])];
    if (urls.length > 5) return { error: "Attach up to five photos" };
    if (urls.some((u) => !ownUpload(user, u) || !/\.(png|jpe?g)$/i.test(u)))
      return { error: "Upload the photos first (JPG or PNG), then attach them." };
    return { urls };
  }
  function tell(userIds, key, params, link) {
    for (const uid of userIds) notify(uid, { key, params }, link);
  }
  const supplierUsers = (task) =>
    getDb()
      .users.filter((u) => u.supplierId && u.supplierId === task.assignedSupplierId)
      .map((u) => u.id);
  const customerUsers = (project) => [project.customerId, ...(project.participantIds || [])];

  async function handle(req, res, url, parts, user) {
    // /api/projects/:projectId/tasks/:taskId/defects[/:defectId]
    if (!(parts[1] === "projects" && parts[3] === "tasks" && parts[5] === "defects" && !parts[7]))
      return false;
    const method = req.method,
      project = projectFor(user, parts[2]),
      { task } = findTask(project, parts[4]);
    if (!project || !task || (user.role === "supplier" && task.assignedSupplierId !== user.supplierId))
      return (send(res, 404, { error: "Task not found" }), true);
    task.defects ||= [];
    const isCustomer = user.role === "customer",
      isSupplier = user.role === "supplier",
      link = (role) => `/${role}/projects/${project.id}`,
      params = (d) => ({ title: d.title, task: task.name });

    if (!parts[6] && method === "GET") return (send(res, 200, { defects: task.defects }), true);

    if (!parts[6] && method === "POST") {
      if (!isCustomer) return (send(res, 403, { error: "Only the customer records defects" }), true);
      if (project.status === "Archived")
        return (send(res, 409, { error: "This project is archived and can no longer be changed." }), true);
      if (task.defects.length >= MAX_DEFECTS)
        return (send(res, 400, { error: "This task already has 200 defects" }), true);
      const b = await body(req),
        title = text(b.title, 160),
        severity = b.severity || "minor",
        dueDate = b.dueDate ? String(b.dueDate) : "",
        pics = photos(user, b.photoUrls);
      if (!title) return (send(res, 400, { error: "Describe the defect in a short title" }), true);
      if (!SEVERITIES.includes(severity))
        return (send(res, 400, { error: "Choose minor, major or critical" }), true);
      if (dueDate && !validDay(dueDate))
        return (send(res, 400, { error: "Enter the due date as a date" }), true);
      if (pics.error) return (send(res, 400, { error: pics.error }), true);
      const d = {
        id: id("def"),
        title,
        description: text(b.description, 3000),
        photoUrls: pics.urls,
        severity,
        status: "open",
        createdBy: user.id,
        createdAt: now(),
        dueDate,
        history: [{ status: "open", by: user.id, at: now() }],
      };
      task.defects.push(d);
      tell(supplierUsers(task), "defectCreated", params(d), link("supplier"));
      activity(user, `Recorded defect "${d.title}" on ${task.name}`);
      save();
      return (send(res, 201, { defect: d }), true);
    }

    const d = parts[6] && task.defects.find((x) => x.id === parts[6]);
    if (parts[6] && !d) return (send(res, 404, { error: "Defect not found" }), true);
    if (d && method === "PATCH") {
      const b = await body(req),
        note = text(b.note, 1000),
        step = (status, extra = {}) => {
          Object.assign(d, { status, updatedAt: now(), ...extra });
          d.history.push({ status, by: user.id, at: now(), ...(note ? { note } : {}) });
        };
      if (b.action === "fixed") {
        if (!isSupplier)
          return (send(res, 403, { error: "Only the supplier marks a defect as fixed" }), true);
        if (d.status !== "open")
          return (send(res, 409, { error: "Only open defects can be marked as fixed" }), true);
        const pics = photos(user, b.photoUrls);
        if (pics.error) return (send(res, 400, { error: pics.error }), true);
        if (!pics.urls.length) return (send(res, 400, { error: "Add a photo of the fixed defect" }), true);
        step("fixed", { fixPhotoUrls: pics.urls, fixNote: note, fixedAt: now() });
        tell(customerUsers(project), "defectFixed", params(d), link("customer"));
      } else if (b.action === "verified" || b.action === "reopen") {
        if (!isCustomer)
          return (send(res, 403, { error: "Only the customer verifies or reopens a defect" }), true);
        if (d.status !== "fixed")
          return (send(res, 409, { error: "The supplier has to mark the defect as fixed first" }), true);
        if (b.action === "reopen" && !note)
          return (send(res, 400, { error: "Say what is still wrong before reopening" }), true);
        if (b.action === "verified") step("verified", { verifiedAt: now() });
        else step("open", { reopenNote: note });
        tell(
          supplierUsers(task),
          b.action === "verified" ? "defectVerified" : "defectReopened",
          { ...params(d), note },
          link("supplier"),
        );
      } else return (send(res, 400, { error: "Choose fixed, verified or reopen" }), true);
      activity(user, `Defect "${d.title}" on ${task.name}: ${d.status}`);
      save();
      return (send(res, 200, { defect: d }), true);
    }
    return false;
  }

  // Defect photos open for the project's customer team and the supplier assigned to the task.
  function canAccessFile(user, fileUrl) {
    if (!user) return false;
    for (const project of getDb().projects || [])
      for (const phase of project.phases || [])
        for (const task of phase.tasks || [])
          for (const d of task.defects || [])
            if ([...(d.photoUrls || []), ...(d.fixPhotoUrls || [])].includes(fileUrl))
              return (
                user.role === "admin" ||
                (user.role === "customer" && !!projectFor(user, project.id)) ||
                (user.role === "supplier" && task.assignedSupplierId === user.supplierId)
              );
    return false;
  }

  return { handle, canAccessFile, SEVERITIES };
};
