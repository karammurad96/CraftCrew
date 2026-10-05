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
  const { suggest, cleanWeights, scorecard, clause, contractFromAward } = ctx;
  const OPTION_LABELS = ["fastest", "cheapest", "best", "recommended"];
  const text = (v, max) =>
    String(v ?? "")
      .trim()
      .slice(0, max);
  const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) && !Number.isNaN(Date.parse(v));
  const list = () => (getDb().requests ||= []);
  const admins = () => getDb().users.filter((u) => u.role === "admin");

  // What a customer may see: no operator notes, no sourcing data (T223/T224 add more operator-only fields).
  const OPERATOR_ONLY = ["operatorNote", "suggestions", "bidId", "operatorId", "leakHints"];
  function view(user, r) {
    if (user.role === "admin") return { ...r, sourcing: sourcingView(r) };
    const out = { ...r };
    for (const k of OPERATOR_ONLY) delete out[k];
    out.history = (r.history || []).map(({ byId, ...h }) => h);
    // T224: the customer sees options only once they are published, and never who is behind them
    out.options = ["Options ready", "Chosen", "Contracted"].includes(r.status)
      ? (r.options || []).map(customerOption)
      : [];
    out.thread = (r.thread || []).map(({ byId, ...m }) => m);
    // T225: the supplier is named only once both sides have accepted the contract
    delete out.award;
    if (r.award) out.award = { status: r.award.status, expiresAt: r.award.expiresAt };
    if (r.status !== "Contracted") delete out.supplier;
    return out;
  }
  // T224: an option as the customer sees it. Only fields picked here leave the server: no supplier id, name,
  // contact details or the supplier's own amount.
  function customerOption(o) {
    return {
      id: o.id,
      label: o.label,
      note: o.note,
      price: o.price,
      deliveryDays: o.deliveryDays,
      profile: o.profile,
      attachments: o.attachments || [],
      chosen: !!o.chosen,
      declined: !!o.declined,
    };
  }
  // The anonymised profile of a supplier: level, track record and certificate types, never who they are
  function anonymousProfile(supplierId) {
    const s = getDb().suppliers.find((x) => x.id === supplierId) || {},
      card = scorecard(supplierId);
    return {
      badge: s.badge || "",
      rating: s.rating || null,
      completedOrders: card?.metrics?.completed || s.projectsCompleted || 0,
      onTimeRate: card?.metrics?.onTimeRate ?? null,
      score: card?.score ?? null,
      yearsInBusiness: s.experience || null,
      certifications: [...new Set(s.certifications || [])].slice(0, 10),
      country: String(s.location || "")
        .split(",")
        .pop()
        .trim(),
    };
  }
  // T224: labels suggested for the offers of a round: the cheapest, the fastest and the best scorecard
  function suggestedLabels(offers) {
    const live = offers.filter((o) => o.status === "Submitted" || o.status === "Changes requested");
    if (!live.length) return {};
    const by = (f) => [...live].sort(f)[0].id,
      out = {};
    out[by((a, b) => (scorecard(b.supplierId)?.score ?? -1) - (scorecard(a.supplierId)?.score ?? -1))] =
      "best";
    out[by((a, b) => a.deliveryDays - b.deliveryDays)] = "fastest";
    out[by((a, b) => a.amount - b.amount)] = "cheapest";
    return out;
  }
  // The price the customer pays (T224). Model A, the default: the supplier's price, with the platform fee taken
  // from the payout. Model B: a markup on top (brokerMarkupPercent > 0), which needs Karam's decision and T80.
  function customerPrice(amount) {
    const markup = Math.max(0, Math.min(30, Number(getDb().settings?.brokerMarkupPercent) || 0));
    return Math.round(amount * (1 + markup / 100) * 100) / 100;
  }
  // The operator's view of the brokered bid (T223): who was invited and what each one offered
  function sourcingView(r) {
    const db = getDb(),
      bid = r.bidId && (db.bids || []).find((b) => b.id === r.bidId);
    if (!bid) return null;
    const company = (sid) => db.suppliers.find((s) => s.id === sid)?.company || "",
      labels = suggestedLabels(bid.offers || []);
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
            .map(
              ({ id: offerId, amount, deliveryDays, status, notes, hourlyRate, updatedAt, attachment }) => ({
                id: offerId,
                suggestedLabel: labels[offerId] || "",
                attachment: attachment || "",
                amount,
                deliveryDays,
                status,
                notes,
                hourlyRate,
                updatedAt,
              }),
            )[0] || null,
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
      if (project.status === "Archived")
        return { error: "The selected project, phase or task was not found." };
    }
    // T230: the work packages. A project task (unassigned) or a new one; without any, the request is one package.
    const given =
      Array.isArray(b.packages) && b.packages.length
        ? b.packages
        : [{ taskId: task?.id, category: b.category, hours: b.hours }];
    if (given.length > 10) return { error: "A request can have up to ten work packages." };
    const tasks = project ? project.phases.flatMap((ph) => (ph.tasks || []).map((t) => ({ ph, t }))) : [],
      packages = [];
    for (const g of given) {
      const category = text(g?.category, 80);
      if (!categories().includes(category)) return { error: "Choose a category from the list." };
      let hours = null;
      if (g.hours !== undefined && g.hours !== null && g.hours !== "") {
        hours = Number(g.hours);
        if (!Number.isFinite(hours) || hours < 1 || hours > 5000)
          return { error: "Enter the effort in hours (1 to 5,000), or leave it empty." };
      }
      const own = g.taskId ? tasks.find((x) => x.t.id === g.taskId) : null;
      if (g.taskId && (!own || (own.t.assignedSupplierId && own.t.acceptanceStatus !== "Declined")))
        return { error: "Choose open tasks of the selected project as work packages." };
      if (own && packages.some((x) => x.taskId === own.t.id))
        return { error: "Choose open tasks of the selected project as work packages." };
      const name = own ? own.t.name : text(g.name, 140) || (given.length === 1 ? title : "");
      if (name.length < 2) return { error: "Give every work package a name." };
      if (!hours && own && Number(own.t.estimatedHours) > 0) hours = Number(own.t.estimatedHours);
      packages.push({ taskId: own?.t.id || null, phaseId: own?.ph.id || null, name, category, hours });
    }
    // Effort not given: one person, eight hours a working day over the wished period (a week without dates)
    const rough = workingDays(startDate, dueDate) * 8;
    for (const x of packages) if (!x.hours) Object.assign(x, { hours: rough, rough: true });
    const category = packages[0].category;
    return {
      fields: {
        title,
        description,
        category,
        packages,
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

  /* ---------- T230: every request belongs to a project, every package to one of its tasks ---------- */
  function workingDays(from, to) {
    if (!from || !to) return 5;
    let n = 0;
    for (let d = new Date(from); d <= new Date(to) && n < 400; d.setUTCDate(d.getUTCDate() + 1))
      if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) n++;
    return Math.max(1, n);
  }
  function newTask(name, description, start, due) {
    return {
      id: id("tsk"),
      name,
      description,
      startDate: start,
      dueDate: due,
      status: "Not Started",
      assignedSupplierId: null,
      acceptanceStatus: "Unassigned",
      orderAmount: null,
      dependencies: [],
      progress: 0,
      subtasks: [],
      assignmentHistory: [],
      offers: [],
    };
  }
  // The project of a new request: the chosen one, or a new one named after the request. Packages without a task
  // become tasks of a phase "Requested work".
  function linkProject(user, r) {
    const db = getDb(),
      start = r.startDate || now().slice(0, 10),
      due = r.dueDate || new Date(Date.parse(start) + 28 * 86400000).toISOString().slice(0, 10);
    let p = r.projectId && db.projects.find((x) => x.id === r.projectId);
    if (!p) {
      p = {
        id: id("prj"),
        customerId: user.id,
        name: r.title,
        description: r.description,
        requirements: "",
        location: [r.sitePostcode, r.siteCity].filter(Boolean).join(" "),
        buyerReference: "",
        budget: r.budget || 0,
        startDate: start,
        dueDate: due,
        status: "In Progress",
        template: "",
        phases: [],
        fromRequestId: r.id,
        createdAt: now(),
        updatedAt: now(),
      };
      db.projects.unshift(p);
    }
    let phase = null;
    for (const x of r.packages) {
      x.id = id("pkg");
      if (x.taskId) continue;
      if (!phase) {
        phase = {
          id: id("ph"),
          name: "Requested work",
          description: r.title,
          startDate: start,
          dueDate: due,
          status: "Not Started",
          dependencies: [],
          supplierId: null,
          acceptanceStatus: "Unassigned",
          orderAmount: null,
          subtasks: [],
          assignmentHistory: [],
          deliverables: [],
          tasks: [],
        };
        p.phases.push(phase);
      }
      const t = newTask(x.name, r.packages.length === 1 ? r.description : "", start, due);
      t.estimatedHours = x.hours;
      phase.tasks.push(t);
      Object.assign(x, { taskId: t.id, phaseId: phase.id });
    }
    p.updatedAt = now();
    Object.assign(r, { projectId: p.id, projectName: p.name });
    // One package: the request stands for that task (T225 assigns it)
    if (r.packages.length === 1) {
      const t = p.phases.flatMap((ph) => ph.tasks || []).find((x) => x.id === r.packages[0].taskId);
      Object.assign(r, { phaseId: r.packages[0].phaseId, taskId: t.id, taskName: t.name });
    } else Object.assign(r, { phaseId: null, taskId: null, taskName: "" });
  }

  /* ---------- T225: the customer's choice, the supplier's confirmation, the reveal ---------- */
  const SUPPLIER_DAYS = 3; // working days the supplier has to accept a chosen option
  function workingDaysFrom(start, n) {
    const d = new Date(start);
    while (n > 0) {
      d.setUTCDate(d.getUTCDate() + 1);
      if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) n--;
    }
    return d.toISOString();
  }
  const supplierUsers = (sid) => getDb().users.filter((u) => u.supplierId === sid);
  // The chosen option goes back: declined by the supplier, or no answer in time
  function releaseAward(r, reason) {
    const opt = (r.options || []).find((o) => o.id === r.award.optionId);
    if (opt) Object.assign(opt, { chosen: false, declined: true });
    r.awardHistory ||= [];
    r.awardHistory.push({ ...r.award, status: reason, endedAt: now() });
    delete r.award;
    r.status = "Options ready";
    r.updatedAt = now();
    r.history.push({ at: now(), status: "Options ready", by: "platform", note: reason });
    notify(
      r.customerId,
      { key: "requestOptionReleased", params: { title: r.title } },
      `/customer/requests/${r.id}`,
    );
    for (const a of admins())
      notify(a.id, { key: "requestOptionReleased", params: { title: r.title } }, `/admin/requests/${r.id}`);
  }
  function expireAwards() {
    let changed = false;
    for (const r of list())
      if (r.award?.status === "Waiting for supplier" && r.award.expiresAt < now()) {
        releaseAward(r, "Expired");
        changed = true;
      }
    if (changed) save();
  }
  // Both sides accepted: award the round, put the supplier on the work, write the contract, reveal both sides
  function contract(r) {
    const db = getDb(),
      a = r.award,
      bid = (db.bids || []).find((b) => b.id === r.bidId),
      offer = bid?.offers?.find((o) => o.id === a.offerId),
      supplier = db.suppliers.find((s) => s.id === a.supplierId),
      customer = db.users.find((u) => u.id === r.customerId);
    if (!bid || !offer || !supplier) return "The offer behind this option no longer exists.";
    // The work: the customer's task if the request came from one, else a new project for it
    let p = r.projectId && db.projects.find((x) => x.id === r.projectId),
      task = p && r.taskId && p.phases.flatMap((ph) => ph.tasks || []).find((x) => x.id === r.taskId);
    if (task?.assignedSupplierId && task.assignedSupplierId !== supplier.id) task = null;
    if (!task) {
      const start = r.startDate || now().slice(0, 10),
        due =
          r.dueDate ||
          new Date(Date.parse(start) + Math.max(1, a.deliveryDays) * 86400000).toISOString().slice(0, 10),
        phase = {
          id: id("ph"),
          name: r.category,
          description: "",
          startDate: start,
          dueDate: due,
          status: "In Progress",
          dependencies: [],
          supplierId: null,
          acceptanceStatus: "Unassigned",
          orderAmount: null,
          subtasks: [],
          assignmentHistory: [],
          deliverables: [],
          tasks: [],
        };
      task = {
        id: id("tsk"),
        name: r.title,
        description: r.description,
        startDate: start,
        dueDate: due,
        dependencies: [],
        progress: 0,
        subtasks: [],
        assignmentHistory: [],
        offers: [],
      };
      phase.tasks.push(task);
      if (!p) {
        p = {
          id: id("prj"),
          customerId: r.customerId,
          name: r.title,
          description: r.description,
          requirements: "",
          location: [r.sitePostcode, r.siteCity].filter(Boolean).join(" "),
          buyerReference: "",
          budget: a.price,
          startDate: start,
          dueDate: due,
          status: "In Progress",
          template: "",
          phases: [],
          createdAt: now(),
          updatedAt: now(),
        };
        db.projects.unshift(p);
      }
      p.phases.push(phase);
      r.projectId = p.id;
      r.projectName = p.name;
      r.taskId = task.id;
    }
    // T226: the operator stays in this project's conversations
    Object.assign(p, { brokered: true, operatorId: p.operatorId || r.operatorId || null });
    Object.assign(task, {
      assignedSupplierId: supplier.id,
      acceptanceStatus: "Accepted",
      status: "In Progress",
      orderAmount: a.price,
    });
    task.assignmentHistory ||= [];
    task.assignmentHistory.push({
      supplierId: supplier.id,
      company: supplier.company,
      status: "Accepted via platform",
      at: now(),
    });
    offer.status = "Accepted";
    for (const o of bid.offers) if (o.id !== offer.id && o.status !== "Declined") o.status = "Not selected";
    Object.assign(bid, {
      status: "Awarded",
      awardedOfferId: offer.id,
      awardedAt: now(),
      awardedAmount: offer.amount,
      projectId: p.id,
      projectName: p.name,
      taskId: task.id,
      updatedAt: now(),
    });
    contractFromAward(bid, offer, customer || { id: r.customerId });
    const c = (db.contracts || []).find((x) => x.bidId === bid.id);
    if (c)
      Object.assign(c, {
        brokered: true,
        requestId: r.id,
        status: "Active",
        value: a.price,
        supplierAmount: offer.amount,
        platformFeePercent: Number(db.settings?.platformFeePercent ?? 3),
        endDate: task.dueDate,
        clause: {
          version: a.customerAcceptance.version,
          hash: a.customerAcceptance.hash,
          months: clause.current().months,
        },
        acceptances: { customer: a.customerAcceptance, supplier: a.supplierAcceptance },
        updatedAt: now(),
      });
    clause.recordIntroduction(r.customerId, supplier.id, r.id);
    a.status = "Accepted";
    r.supplier = { id: supplier.id, company: supplier.company };
    r.contractId = c?.id || null;
    move(r, "Contracted", { role: "admin", id: a.supplierAcceptance.userId });
    r.history.at(-1).by = "supplier";
    notify(
      r.customerId,
      { key: "requestContracted", params: { title: r.title, company: supplier.company } },
      `/customer/requests/${r.id}`,
    );
    for (const u of supplierUsers(supplier.id))
      notify(
        u.id,
        { key: "brokeredOrderConfirmed", params: { title: r.title, company: customer?.company || "" } },
        `/supplier/projects/${p.id}`,
      );
    for (const ad of admins())
      notify(
        ad.id,
        { key: "requestContracted", params: { title: r.title, company: supplier.company } },
        `/admin/requests/${r.id}`,
      );
    return null;
  }
  // What a supplier sees of an order offered to them: the work and their own price; the customer once contracted
  function supplierOrder(r) {
    const db = getDb(),
      contracted = r.status === "Contracted";
    return {
      requestId: r.id,
      title: r.title,
      description: r.description,
      category: r.category,
      region: r.sitePostcode ? r.sitePostcode.slice(0, 2) : "",
      startDate: r.startDate,
      dueDate: r.dueDate,
      amount: r.award.supplierAmount,
      deliveryDays: r.award.deliveryDays,
      status: r.award.status,
      expiresAt: r.award.expiresAt,
      clause: clause.current(),
      ...(contracted
        ? {
            customerCompany: db.users.find((u) => u.id === r.customerId)?.company || "",
            projectId: r.projectId,
          }
        : {}),
    };
  }
  async function handleOrders(req, res, parts, user) {
    const method = req.method;
    if (user.role !== "supplier" || !user.supplierId)
      return (send(res, 403, { error: "Only suppliers confirm platform orders." }), true);
    expireAwards();
    const mine = list().filter((r) => r.award?.supplierId === user.supplierId);
    if (!parts[2] && method === "GET") return (send(res, 200, { orders: mine.map(supplierOrder) }), true);
    const r = mine.find((x) => x.id === parts[2]);
    if (!r || parts.length !== 4 || method !== "POST")
      return (send(res, 404, { error: "Order not found" }), true);
    if (r.award.status !== "Waiting for supplier")
      return (send(res, 409, { error: "This order was already answered." }), true);
    const b = await body(req);
    if (parts[3] === "decline") {
      releaseAward(r, "Declined by the supplier");
      save();
      return (send(res, 200, { ok: true }), true);
    }
    if (parts[3] !== "accept") return (send(res, 404, { error: "Order not found" }), true);
    if (b.acceptClause !== true)
      return (send(res, 400, { error: "Accept the platform contract to confirm." }), true);
    if (b.clauseHash !== clause.current().hash)
      return (
        send(res, 409, { error: "The contract terms changed. Read them again and accept them." }),
        true
      );
    r.award.supplierAcceptance = clause.acceptance(user, "brokered-contract");
    const failed = contract(r);
    if (failed) return (send(res, 409, { error: failed }), true);
    activity(user, `Accepted platform order ${r.title}`);
    save();
    return (send(res, 200, { order: supplierOrder(r) }), true);
  }

  async function handle(req, res, url, parts, user) {
    if (parts[1] === "brokered-orders") return handleOrders(req, res, parts, user);
    if (parts[1] !== "requests") return false;
    const method = req.method;
    if (user.role === "supplier")
      return (send(res, 403, { error: "Requests are between customers and the platform." }), true);

    expireAwards();
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
      linkProject(user, r);
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
    // T225: the customer chooses an option and accepts the platform contract with the clause
    if (parts[3] === "choose" && !parts[4] && method === "POST") {
      if (user.role !== "customer")
        return (send(res, 403, { error: "Only the customer chooses an option." }), true);
      const b = await body(req),
        opt = (r.options || []).find((o) => o.id === b.optionId && !o.declined);
      if (r.status !== "Options ready" || !opt)
        return (send(res, 409, { error: "This option can no longer be chosen." }), true);
      if (b.acceptClause !== true)
        return (send(res, 400, { error: "Accept the platform contract to confirm." }), true);
      if (b.clauseHash !== clause.current().hash)
        return (
          send(res, 409, { error: "The contract terms changed. Read them again and accept them." }),
          true
        );
      opt.chosen = true;
      r.award = {
        optionId: opt.id,
        offerId: opt.offerId,
        supplierId: opt.supplierId,
        price: opt.price,
        supplierAmount: opt.supplierAmount,
        deliveryDays: opt.deliveryDays,
        customerAcceptance: clause.acceptance(user, "brokered-contract"),
        status: "Waiting for supplier",
        offeredAt: now(),
        expiresAt: workingDaysFrom(Date.now(), SUPPLIER_DAYS),
      };
      move(r, "Chosen", user);
      for (const u of supplierUsers(opt.supplierId))
        notify(u.id, { key: "brokeredOrderNew", params: { title: r.title } }, "/supplier/orders");
      for (const a of admins())
        notify(a.id, { key: "requestChosen", params: { title: r.title } }, `/admin/requests/${r.id}`);
      activity(user, `Chose an option for request ${r.title}`);
      save();
      return (send(res, 200, { request: view(user, r) }), true);
    }
    // T224: the operator builds up to three options from the offers of the round
    if (parts[3] === "options" && !parts[4] && method === "PUT") {
      if (user.role !== "admin") return (send(res, 403, { error: "Admin only" }), true);
      if (!["Sourcing", "Options ready"].includes(r.status))
        return (
          send(res, 409, { error: "Options can be prepared while the request is being sourced." }),
          true
        );
      const b = await body(req),
        bid = r.bidId && (getDb().bids || []).find((x) => x.id === r.bidId),
        picks = Array.isArray(b.options) ? b.options : [];
      if (!bid || !picks.length || picks.length > 3)
        return (send(res, 400, { error: "Choose one to three offers as options." }), true);
      const seen = new Set(),
        options = [];
      for (const pick of picks) {
        const offer = (bid.offers || []).find((o) => o.id === pick.offerId);
        if (!offer || !["Submitted", "Changes requested"].includes(offer.status) || seen.has(offer.id))
          return (send(res, 400, { error: "Choose one to three offers as options." }), true);
        seen.add(offer.id);
        if (!OPTION_LABELS.includes(pick.label))
          return (
            send(res, 400, { error: "Label each option as fastest, cheapest, best quality or recommended." }),
            true
          );
        options.push({
          id: id("opt"),
          offerId: offer.id,
          supplierId: offer.supplierId,
          supplierAmount: offer.amount,
          label: pick.label,
          note: text(pick.note, 1000),
          price: customerPrice(offer.amount),
          deliveryDays: offer.deliveryDays,
          profile: anonymousProfile(offer.supplierId),
          // An offer file goes to the customer only when the operator marks it free of names
          attachments: pick.shareAttachment && offer.attachment ? [offer.attachment] : [],
        });
      }
      r.options = options;
      r.updatedAt = now();
      save();
      return (send(res, 200, { request: view(user, r) }), true);
    }
    if (parts[3] === "publish" && !parts[4] && method === "POST") {
      if (user.role !== "admin") return (send(res, 403, { error: "Admin only" }), true);
      if (r.status !== "Sourcing" || !(r.options || []).length)
        return (send(res, 409, { error: "Prepare at least one option before publishing." }), true);
      move(r, "Options ready", user);
      notify(
        r.customerId,
        { key: "requestOptionsReady", params: { title: r.title, n: r.options.length } },
        `/customer/requests/${r.id}`,
      );
      save();
      return (send(res, 200, { request: view(user, r) }), true);
    }
    // T224: customer and platform write to each other on the request; the customer can ask for another round
    if (parts[3] === "messages" && !parts[4] && method === "POST") {
      const b = await body(req),
        message = text(b.text, 3000);
      if (!message) return (send(res, 400, { error: "Write a message first." }), true);
      if (["Withdrawn", "Closed"].includes(r.status))
        return (send(res, 409, { error: "This request is already finished." }), true);
      const anotherRound = !!b.anotherRound && user.role === "customer";
      if (anotherRound && r.status !== "Options ready")
        return (send(res, 409, { error: "Another round can be asked for once options are ready." }), true);
      r.thread ||= [];
      r.thread.push({
        id: id("rqm"),
        at: now(),
        by: user.role === "admin" ? "platform" : "customer",
        byId: user.id,
        text: message,
      });
      if (user.role === "admin")
        notify(
          r.customerId,
          { key: "requestMessage", params: { title: r.title } },
          `/customer/requests/${r.id}`,
        );
      else
        for (const a of admins())
          notify(a.id, { key: "requestMessage", params: { title: r.title } }, `/admin/requests/${r.id}`);
      if (anotherRound) move(r, "Sourcing", user, message);
      r.updatedAt = now();
      save();
      return (send(res, 201, { request: view(user, r) }), true);
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
