/*
 * Customer requests to the platform (T222, Wave 15 "brokering with control"). A customer describes the work;
 * the platform's operators (admins) take the request, source suppliers (T223) and prepare options (T224).
 * The customer never sees the operators' working data, and suppliers never see a request.
 *
 * Status: New → Sourcing → Options ready → Chosen → Contracted, or Withdrawn (customer) / Closed (operator).
 */
const REQUEST_STATUSES = ["New", "Sourcing", "Options ready", "Chosen", "Contracted", "Withdrawn", "Closed"];
const OPEN = ["New", "Sourcing", "Options ready"];
const DAY = 86400000;

module.exports = function createRequests(ctx) {
  const { getDb, save, send, body, id, now, notify, activity, projectFor, ownUpload, categories } = ctx;
  const { suggest, cleanWeights } = ctx;
  const text = (v, max) =>
    String(v ?? "")
      .trim()
      .slice(0, max);
  const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) && !Number.isNaN(Date.parse(v));
  const list = () => (getDb().requests ||= []);
  const admins = () => getDb().users.filter((u) => u.role === "admin");

  // What a customer may see: no operator notes, no sourcing data (T223/T224 add more operator-only fields).
  const OPERATOR_ONLY = ["operatorNote", "suggestions", "bidId"];
  function view(user, r) {
    if (user.role === "admin") return { ...r, sourcing: sourcingView(r) };
    const out = { ...r };
    for (const k of OPERATOR_ONLY) delete out[k];
    out.history = (r.history || []).map(({ byId, ...h }) => h);
    return out;
  }
  // The operator's view of the brokered bid (T223): who was invited and what each one offered
  function sourcingView(r) {
    const db = getDb(),
      bid = r.bidId && (db.bids || []).find((b) => b.id === r.bidId);
    if (!bid) return null;
    const company = (sid) => db.suppliers.find((s) => s.id === sid)?.company || "";
    return {
      bidId: bid.id,
      status: bid.status,
      dueDate: bid.dueDate,
      invited: (bid.invitedSupplierIds || []).map((sid) => ({
        supplierId: sid,
        company: company(sid),
        offer:
          (bid.offers || [])
            .filter((o) => o.supplierId === sid)
            .map(({ id: offerId, amount, deliveryDays, status, notes, hourlyRate, updatedAt }) => ({
              id: offerId,
              amount,
              deliveryDays,
              status,
              notes,
              hourlyRate,
              updatedAt,
            }))[0] || null,
      })),
    };
  }
  // T223: suggestions are stored with the time they were made, so the operator sees them on opening
  function refreshSuggestions(r) {
    r.suggestions = { at: now(), list: suggest(r) };
    return r.suggestions;
  }
  function take(r, user, optionsBy) {
    Object.assign(r, { operatorId: user.id, operatorName: user.name, optionsBy });
    move(r, "Sourcing", user);
    notify(
      r.customerId,
      { key: "requestTaken", params: { title: r.title, date: optionsBy } },
      `/customer/requests/${r.id}`,
    );
  }
  // A request that ends before an option is chosen ends its bid round too
  function endBid(r) {
    const bid = r.bidId && (getDb().bids || []).find((b) => b.id === r.bidId);
    if (!bid || ["Awarded", "Closed"].includes(bid.status)) return;
    bid.status = "Closed";
    bid.updatedAt = now();
    for (const o of bid.offers || [])
      if (["Submitted", "Changes requested"].includes(o.status)) o.status = "Not selected";
  }
  function canSee(user, r) {
    return user.role === "admin" || (user.role === "customer" && r.customerId === user.id);
  }
  function move(r, status, by, note = "") {
    r.status = status;
    r.updatedAt = now();
    r.history ||= [];
    r.history.push({
      at: r.updatedAt,
      status,
      by: by.role === "admin" ? "platform" : "customer",
      byId: by.id,
      ...(note ? { note } : {}),
    });
  }

  // The fields a customer sends; returns {error} or {fields}
  function clean(user, b) {
    const title = text(b.title, 160),
      description = text(b.description, 5000);
    if (title.length < 3 || description.length < 10)
      return { error: "Give the request a title and describe the work in a few sentences." };
    const category = text(b.category, 80);
    if (!categories().includes(category)) return { error: "Choose a category from the list." };
    const startDate = b.startDate ? String(b.startDate) : null,
      dueDate = b.dueDate ? String(b.dueDate) : null;
    if (
      (startDate && !isDate(startDate)) ||
      (dueDate && !isDate(dueDate)) ||
      (startDate && dueDate && dueDate < startDate)
    )
      return { error: "Check the dates: the finish date cannot be before the start." };
    let budget = null;
    if (b.budget !== undefined && b.budget !== null && b.budget !== "") {
      budget = Number(b.budget);
      if (!Number.isFinite(budget) || budget < 0 || budget > 100000000)
        return { error: "Enter the budget in euros, or leave it empty." };
    }
    const attachments = [...new Set(Array.isArray(b.attachments) ? b.attachments : [])];
    if (attachments.length > 10) return { error: "Attach up to ten files." };
    if (attachments.some((u) => !ownUpload(user, u)))
      return { error: "Upload the file first, then attach it." };
    let project = null,
      phase = null,
      task = null;
    if (b.projectId) {
      project = projectFor(user, String(b.projectId));
      phase = project && b.phaseId ? project.phases.find((x) => x.id === b.phaseId) : null;
      task = phase && b.taskId ? (phase.tasks || []).find((x) => x.id === b.taskId) : null;
      if (!project || (b.phaseId && !phase) || (b.taskId && !task))
        return { error: "The selected project, phase or task was not found." };
    }
    return {
      fields: {
        title,
        description,
        category,
        siteCity: text(b.siteCity, 80),
        sitePostcode: text(b.sitePostcode, 10),
        startDate,
        dueDate,
        budget,
        attachments,
        projectId: project?.id || null,
        projectName: project?.name || "",
        phaseId: phase?.id || null,
        taskId: task?.id || null,
        taskName: task?.name || "",
      },
    };
  }

  async function handle(req, res, url, parts, user) {
    if (parts[1] !== "requests") return false;
    const method = req.method;
    if (user.role === "supplier")
      return (send(res, 403, { error: "Requests are between customers and the platform." }), true);

    if (!parts[2] && method === "GET") {
      const mine = list()
        .filter((r) => canSee(user, r))
        .map((r) => view(user, r));
      return (send(res, 200, { requests: mine }), true);
    }
    if (!parts[2] && method === "POST") {
      if (user.role !== "customer") return (send(res, 403, { error: "Only customers send requests." }), true);
      const { error, fields } = clean(user, await body(req));
      if (error) return (send(res, 400, { error }), true);
      const r = {
        id: id("req"),
        customerId: user.id,
        customerName: user.name,
        customerCompany: user.company || "",
        ...fields,
        createdAt: now(),
      };
      move(r, "New", user);
      if (getDb().settings?.autoSuggest !== false) refreshSuggestions(r);
      list().unshift(r);
      for (const a of admins())
        notify(a.id, { key: "requestNew", params: { title: r.title } }, `/admin/requests/${r.id}`);
      activity(user, `Sent request ${r.title}`);
      save();
      return (send(res, 201, { request: view(user, r) }), true);
    }
    const r = parts[2] && list().find((x) => x.id === parts[2]);
    if (!r || !canSee(user, r)) return (send(res, 404, { error: "Request not found" }), true);
    if (!parts[3] && method === "GET") return (send(res, 200, { request: view(user, r) }), true);
    if (!parts[3] && method === "PATCH") {
      const b = await body(req),
        link = `/customer/requests/${r.id}`;
      if (b.action === "withdraw") {
        if (user.role !== "customer" || !OPEN.includes(r.status))
          return (send(res, 409, { error: "This request can no longer be withdrawn." }), true);
        move(r, "Withdrawn", user, text(b.reason, 1000));
        endBid(r);
        for (const a of admins())
          notify(a.id, { key: "requestWithdrawn", params: { title: r.title } }, `/admin/requests/${r.id}`);
      } else if (b.action === "take") {
        if (user.role !== "admin") return (send(res, 403, { error: "Admin only" }), true);
        if (r.status !== "New")
          return (send(res, 409, { error: "This request is already being handled." }), true);
        const optionsBy = b.optionsBy
          ? String(b.optionsBy)
          : new Date(Date.now() + 5 * DAY).toISOString().slice(0, 10);
        if (!isDate(optionsBy))
          return (send(res, 400, { error: "Enter the date by which the options will be ready." }), true);
        take(r, user, optionsBy);
      } else if (b.action === "close") {
        if (user.role !== "admin") return (send(res, 403, { error: "Admin only" }), true);
        const reason = text(b.reason, 1000);
        if (!reason) return (send(res, 400, { error: "Tell the customer why the request is closed." }), true);
        if (!OPEN.includes(r.status))
          return (send(res, 409, { error: "This request is already finished." }), true);
        r.closeReason = reason;
        move(r, "Closed", user, reason);
        endBid(r);
        notify(r.customerId, { key: "requestClosed", params: { title: r.title, reason } }, link);
      } else if (b.action === "note") {
        if (user.role !== "admin") return (send(res, 403, { error: "Admin only" }), true);
        r.operatorNote = text(b.note, 5000);
        r.updatedAt = now();
      } else return (send(res, 400, { error: "Choose a valid action for this request." }), true);
      save();
      return (send(res, 200, { request: view(user, r) }), true);
    }
    // T223: the operator's supplier suggestions, made again on request
    if (parts[3] === "suggestions" && !parts[4] && method === "GET") {
      if (user.role !== "admin") return (send(res, 403, { error: "Admin only" }), true);
      refreshSuggestions(r);
      save();
      return (send(res, 200, { suggestions: r.suggestions }), true);
    }
    // T223: invite suppliers to quote. The first invitation opens a brokered bid round for the request; suppliers
    // see the work, the region and the dates, never the customer (see GET /api/bids).
    if (parts[3] === "invitations" && !parts[4] && method === "POST") {
      if (user.role !== "admin") return (send(res, 403, { error: "Admin only" }), true);
      if (!OPEN.includes(r.status))
        return (send(res, 409, { error: "This request is already finished." }), true);
      const b = await body(req),
        db = getDb(),
        ids = [
          ...new Set(
            (Array.isArray(b.supplierIds) ? b.supplierIds : []).filter((sid) =>
              db.suppliers.some((s) => s.id === sid && s.live),
            ),
          ),
        ];
      if (!ids.length) return (send(res, 400, { error: "Choose at least one active supplier" }), true);
      db.bids ||= [];
      let bid = r.bidId && db.bids.find((x) => x.id === r.bidId && !["Awarded", "Closed"].includes(x.status));
      if (!bid) {
        const dueDate = String(b.dueDate || "");
        if (!isDate(dueDate) || dueDate < new Date().toISOString().slice(0, 10))
          return (send(res, 400, { error: "Set a future deadline for the offers." }), true);
        bid = {
          id: id("bid"),
          brokered: true,
          requestId: r.id,
          customerId: r.customerId,
          projectId: r.projectId,
          projectName: r.projectName,
          phaseId: r.phaseId,
          taskId: r.taskId,
          taskName: r.taskName,
          operatorId: user.id,
          title: r.title,
          description: r.description,
          category: r.category,
          region: r.sitePostcode ? r.sitePostcode.slice(0, 2) : "",
          startDate: r.startDate,
          finishDate: r.dueDate,
          dueDate,
          status: "Open",
          invitedSupplierIds: [],
          attachments: [...(r.attachments || [])],
          offers: [],
          eventType: "RFQ",
          baseline: null,
          weights: cleanWeights(),
          questions: [],
          createdAt: now(),
          updatedAt: now(),
        };
        db.bids.unshift(bid);
        r.bidId = bid.id;
      }
      if (r.status === "New") take(r, user, new Date(Date.now() + 5 * DAY).toISOString().slice(0, 10));
      const added = ids.filter((sid) => !bid.invitedSupplierIds.includes(sid));
      bid.invitedSupplierIds.push(...added);
      bid.updatedAt = now();
      for (const sid of added)
        for (const su of db.users.filter((x) => x.supplierId === sid))
          notify(su.id, { key: "bidInvitationPlatform", params: { title: bid.title } }, "/supplier/bids");
      activity(user, `Invited ${added.length} supplier(s) to quote for request ${r.title}`);
      save();
      return (send(res, 200, { request: view(user, r) }), true);
    }
    return false;
  }

  return { handle, view, move, REQUEST_STATUSES };
};
