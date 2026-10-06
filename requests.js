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
  const { suggest, cleanWeights, scorecard, clause, estimate, estimates } = ctx;
  // T231: the admin setting wins over INSTANT_ESTIMATES; on by default
  const instantOn = () => getDb().settings?.instantEstimates ?? process.env.INSTANT_ESTIMATES !== "off";
  const OPTION_LABELS = ["fastest", "cheapest", "best", "recommended"];
  const text = (v, max) =>
    String(v ?? "")
      .trim()
      .slice(0, max);
  const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) && !Number.isNaN(Date.parse(v));
  const list = () => (getDb().requests ||= []);
  const admins = () => getDb().users.filter((u) => u.role === "admin");

  // What a customer may see: no operator notes, no sourcing data (T223/T224 add more operator-only fields).
  const OPERATOR_ONLY = ["operatorNote", "suggestions", "bidId", "operatorId", "leakHints", "estimateSkipped"];
  function view(user, r) {
    if (user.role === "admin") {
      // The operator sees who is behind each estimate part, and each part's packages by name
      const company = (sid) => getDb().suppliers.find((s) => s.id === sid)?.company || "";
      const options = (r.options || []).map((o) =>
        o.parts
          ? {
              ...o,
              parts: o.parts.map((p) => ({
                ...p,
                company: company(p.supplierId),
                packages: p.packageIds.map((pid) => r.packages.find((x) => x.id === pid)?.name || ""),
              })),
            }
          : o,
      );
      const award = r.award && {
        ...r.award,
        parts: r.award.parts.map((p) => ({
          ...p,
          company: company(p.supplierId),
          packages: packageNames(r, p.packageIds),
        })),
      };
      return { ...r, options, award, sourcing: sourcingView(r) };
    }
    const out = { ...r };
    for (const k of OPERATOR_ONLY) delete out[k];
    out.history = (r.history || []).map(({ byId, ...h }) => h);
    // T224: the customer sees options only once they are published, and never who is behind them
    out.options = ["Options ready", "Chosen", "Contracted"].includes(r.status)
      ? (r.options || []).map((o) => customerOption(o, r))
      : [];
    out.thread = (r.thread || []).map(({ byId, ...m }) => m);
    delete out.estimateGap;
    // T225: the supplier is named only once both sides have accepted the contract
    delete out.award;
    // T232: each part's state, packages and price, never its supplier; a higher price waits for the customer
    if (r.award)
      out.award = {
        status: r.award.status,
        expiresAt: r.award.expiresAt,
        estimate: !!r.award.estimate,
        gap: r.award.gap || [],
        parts: activeParts(r).map((p) => ({
          id: p.id,
          packages: packageNames(r, p.packageIds),
          hours: p.hours,
          price: p.price,
          days: p.days,
          status: p.status,
          replacement: !!p.replaces,
          ...(p.proposed ? { proposedPrice: p.proposed.price, note: p.proposed.note } : {}),
          ...(p.note ? { note: p.note } : {}),
        })),
      };
    if (r.status !== "Contracted") delete out.supplier;
    return out;
  }
  // T224: an option as the customer sees it. Only fields picked here leave the server: no supplier id, name,
  // contact details or the supplier's own amount.
  function customerOption(o, r) {
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
      // T231: an estimate, maybe split across suppliers; each part shows its packages, never its supplier
      estimate: !!o.estimate,
      split: !!o.split,
      // T241: how sure the estimate is, and what each part's price is made of (in customer prices)
      confidence: o.confidence || null,
      parts: (o.parts || []).map((p) => ({
        id: p.id,
        packages: p.packageIds.map((pid) => r.packages.find((x) => x.id === pid)?.name || ""),
        hours: p.hours,
        price: p.price,
        days: p.days,
        profile: p.profile,
        ...(p.lines ? { lines: Object.fromEntries(Object.entries(p.lines).map(([k, v]) => [k, customerPrice(v)])) } : {}),
      })),
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
    // T241: night, weekend or shift work, and the number of trips (default: one per week of work)
    const SHIFTS = ["night", "weekend", "shift"],
      shifts = [...new Set(Array.isArray(b.shifts) ? b.shifts : [])];
    if (shifts.some((x) => !SHIFTS.includes(x))) return { error: "Choose night, weekend or shift work from the list." };
    let trips = null;
    if (b.trips !== undefined && b.trips !== null && b.trips !== "") {
      trips = Number(b.trips);
      if (!Number.isInteger(trips) || trips < 1 || trips > 50) return { error: "Enter the number of trips (1 to 50), or leave it empty." };
    }
    return {
      fields: {
        shifts,
        trips,
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

  /* ---------- T231: the instant estimate ---------- */
  // Options from the estimate engine: per supplier a part with its packages; the customer price after T224's model
  function instantEstimate(r) {
    const { options, missing, skipped = [] } = estimate(r);
    if (skipped.length) r.estimateSkipped = skipped;
    if (!options.length) {
      r.estimateGap = r.packages.filter((x) => missing.includes(x.id)).map((x) => x.name);
      return;
    }
    r.options = options.map((o) => {
      const parts = o.parts.map((p) => ({
        id: id("prt"),
        supplierId: p.supplierId,
        packageIds: p.packageIds,
        hours: p.hours,
        supplierAmount: p.supplierAmount,
        price: customerPrice(p.supplierAmount),
        days: p.days,
        lines: p.lines,
        unusual: !!p.unusual,
        confidence: p.confidence,
        profile: anonymousProfile(p.supplierId),
      }));
      return {
        id: id("opt"),
        estimate: true,
        label: o.label,
        note: "",
        split: o.split,
        confidence: o.confidence,
        parts,
        supplierId: parts.length === 1 ? parts[0].supplierId : null,
        supplierAmount: o.supplierAmount,
        price: parts.reduce((n, p) => n + p.price, 0),
        deliveryDays: o.days,
        profile: parts.length === 1 ? parts[0].profile : null,
        attachments: [],
      };
    });
    r.estimatedAt = now();
    move(r, "Options ready", { role: "admin", id: null }, "Instant estimate");
    notify(
      r.customerId,
      { key: "requestOptionsReady", params: { title: r.title, n: r.options.length } },
      `/customer/requests/${r.id}`,
    );
  }

  /* ---------- T225, T232: the customer's choice, each supplier's confirmation, the reveal ---------- */
  const SUPPLIER_DAYS = 3; // working days a supplier has to answer
  const ACTIVE = ["Waiting for supplier", "Price changed", "Confirmed"];
  function workingDaysFrom(start, n) {
    const d = new Date(start);
    while (n > 0) {
      d.setUTCDate(d.getUTCDate() + 1);
      if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) n--;
    }
    return d.toISOString();
  }
  const supplierUsers = (sid) => getDb().users.filter((u) => u.supplierId === sid);
  const activeParts = (r) => (r.award?.parts || []).filter((p) => ACTIVE.includes(p.status));
  const packageNames = (r, ids) => ids.map((pid) => r.packages.find((x) => x.id === pid)?.name || "");
  function newPart(fields) {
    return {
      id: id("prt"),
      status: "Waiting for supplier",
      offeredAt: now(),
      expiresAt: workingDaysFrom(Date.now(), SUPPLIER_DAYS),
      ...fields,
    };
  }
  // The award's own status and deadline, and (one supplier) its supplier and price, as T225 showed them
  function summarize(r) {
    const a = r.award,
      act = activeParts(r);
    if (a.status !== "Accepted")
      a.status =
        act.length && act.every((p) => p.status === "Confirmed") ? "Confirmed" : "Waiting for supplier";
    a.expiresAt =
      act
        .filter((p) => p.status === "Waiting for supplier")
        .map((p) => p.expiresAt)
        .sort()[0] || a.expiresAt;
    if (act.length === 1)
      Object.assign(a, {
        supplierId: act[0].supplierId,
        supplierAmount: act[0].supplierAmount,
        price: act[0].price,
        deliveryDays: act[0].days,
      });
  }
  function offerPart(r, part) {
    for (const u of supplierUsers(part.supplierId))
      notify(u.id, { key: "brokeredOrderNew", params: { title: r.title } }, "/supplier/orders");
  }
  // T225: a chosen offer from the operator's round goes back as a whole: the customer chooses again
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
  // T232: an estimate part that a supplier declines, lets expire or prices too high is given to the next suitable
  // supplier: one for all its packages if possible, else one per package. Nobody left: the operator takes over.
  function replacePart(r, part, reason) {
    Object.assign(part, { status: "Declined", endedAt: now(), reason });
    const pkgs = part.packageIds.map((pid) => r.packages.find((x) => x.id === pid)),
      taken = new Set(
        r.award.parts
          .filter(
            (p) => ACTIVE.includes(p.status) || p.packageIds.some((pid) => part.packageIds.includes(pid)),
          )
          .map((p) => p.supplierId),
      ),
      per = pkgs.map((pkg) => estimates.candidates(r, pkg).filter((c) => !taken.has(c.supplierId)));
    if (per.some((l) => !l.length)) {
      r.award.gap = [...new Set([...(r.award.gap || []), ...packageNames(r, part.packageIds)])];
      for (const a of admins())
        notify(a.id, { key: "requestNoSupplier", params: { title: r.title } }, `/admin/requests/${r.id}`);
      notify(
        r.customerId,
        { key: "requestPartReplaced", params: { title: r.title } },
        `/customer/requests/${r.id}`,
      );
      return;
    }
    const common = per[0].filter((c) => per.every((l) => l.some((x) => x.supplierId === c.supplierId))),
      groups = common.length
        ? [{ supplierId: common[0].supplierId, idx: pkgs.map((_, i) => i) }]
        : pkgs.map((_, i) => ({ supplierId: per[i][0].supplierId, idx: [i] }));
    for (const g of groups) {
      // T241: travel and the minimum order count for the new supplier too
      const priced = estimates.partOf(
          r,
          g.supplierId,
          g.idx.map((i) => ({ pkg: pkgs[i], c: per[i].find((c) => c.supplierId === g.supplierId) })),
        ),
        amount = priced.supplierAmount,
        hours = priced.hours,
        next = newPart({
          supplierId: g.supplierId,
          packageIds: g.idx.map((i) => pkgs[i].id),
          hours,
          estimate: amount,
          supplierAmount: amount,
          price: customerPrice(amount),
          days: priced.days,
          lines: priced.lines,
          replaces: part.id,
        });
      r.award.parts.push(next);
      offerPart(r, next);
    }
    notify(
      r.customerId,
      { key: "requestPartReplaced", params: { title: r.title } },
      `/customer/requests/${r.id}`,
    );
  }
  // T262: a package booking the supplier declines (or lets expire) goes back to New: the instant estimate looks for
  // alternatives without that supplier, and the operator is told
  function packageOut(r, part, reason) {
    Object.assign(part, { status: "Declined", endedAt: now(), reason });
    const opt = (r.options || []).find((o) => o.id === r.award.optionId);
    if (opt) Object.assign(opt, { chosen: false, declined: true });
    r.awardHistory ||= [];
    r.awardHistory.push({ ...r.award, status: reason, endedAt: now() });
    delete r.award;
    r.excludeSupplierIds = [...new Set([...(r.excludeSupplierIds || []), part.supplierId])];
    r.options = [];
    move(r, "New", { role: "admin", id: null }, reason);
    if (instantOn()) instantEstimate(r);
    notify(r.customerId, { key: "packageDeclined", params: { title: r.title } }, `/customer/requests/${r.id}`);
    for (const a of admins())
      notify(a.id, { key: "packageDeclinedAdmin", params: { title: r.title } }, `/admin/requests/${r.id}`);
  }
  // A supplier said no (or nothing in time)
  function supplierOut(r, part, reason) {
    if (r.award.fixed) return packageOut(r, part, reason);
    if (r.award.estimate) replacePart(r, part, reason);
    else releaseAward(r, reason);
    if (r.award) summarize(r);
  }
  function expireAwards() {
    let changed = false;
    for (const r of list())
      if (r.award && r.award.status !== "Accepted")
        for (const p of activeParts(r))
          if (p.status === "Waiting for supplier" && p.expiresAt < now() && r.award) {
            supplierOut(r, p, "Expired");
            changed = true;
          }
    if (changed) save();
  }
  // Every part confirmed: each supplier gets its tasks and a contract, both sides are named to each other
  function finalize(r) {
    const db = getDb(),
      a = r.award,
      act = activeParts(r),
      customer = db.users.find((u) => u.id === r.customerId),
      p = db.projects.find((x) => x.id === r.projectId);
    if (!p) return "The offer behind this option no longer exists.";
    const tasks = p.phases.flatMap((ph) => ph.tasks || []);
    // T226: the operator stays in this project's conversations
    Object.assign(p, { brokered: true, operatorId: p.operatorId || r.operatorId || null });
    const suppliers = [],
      contractIds = [];
    for (const part of act) {
      const supplier = db.suppliers.find((s) => s.id === part.supplierId);
      if (!supplier) return "The offer behind this option no longer exists.";
      const pkgs = part.packageIds.map((pid) => r.packages.find((x) => x.id === pid));
      for (const pkg of pkgs) {
        const task = tasks.find((x) => x.id === pkg.taskId);
        if (!task) continue;
        Object.assign(task, {
          assignedSupplierId: supplier.id,
          acceptanceStatus: "Accepted",
          status: "In Progress",
          orderAmount: Math.round((part.price * pkg.hours) / part.hours),
        });
        task.assignmentHistory ||= [];
        task.assignmentHistory.push({
          supplierId: supplier.id,
          company: supplier.company,
          status: "Accepted via platform",
          at: now(),
        });
      }
      // T225: a part from the operator's bid round awards that round
      const bid = part.offerId && (db.bids || []).find((b) => b.id === r.bidId),
        offer = bid?.offers?.find((o) => o.id === part.offerId);
      if (offer) {
        offer.status = "Accepted";
        for (const o of bid.offers)
          if (o.id !== offer.id && o.status !== "Declined") o.status = "Not selected";
        Object.assign(bid, {
          status: "Awarded",
          awardedOfferId: offer.id,
          awardedAt: now(),
          awardedAmount: offer.amount,
          projectId: p.id,
          projectName: p.name,
          taskId: pkgs[0]?.taskId || null,
          updatedAt: now(),
        });
      }
      const names = pkgs.map((x) => x.name),
        due =
          pkgs
            .map((x) => tasks.find((t) => t.id === x.taskId)?.dueDate)
            .filter(Boolean)
            .sort()
            .at(-1) ||
          r.dueDate ||
          "";
      const c = {
        id: id("ctr"),
        customerId: r.customerId,
        supplierId: supplier.id,
        supplierCompany: supplier.company,
        projectId: p.id,
        projectName: p.name,
        bidId: offer ? bid.id : null,
        requestId: r.id,
        title: act.length > 1 ? `${r.title} — ${names.join(", ")}` : r.title,
        category: pkgs[0]?.category || r.category,
        value: part.price,
        currency: "EUR",
        startDate: now().slice(0, 10),
        endDate: due,
        noticeDays: 30,
        autoRenew: false,
        status: "Active",
        terms: `Brokered by the platform for "${r.title}": ${names.join(", ")}, about ${part.hours} h, delivery within ${part.days} days.`,
        brokered: true,
        supplierAmount: part.supplierAmount,
        platformFeePercent: Number(db.settings?.platformFeePercent ?? 3),
        clause: {
          version: a.customerAcceptance.version,
          hash: a.customerAcceptance.hash,
          months: clause.current().months,
        },
        acceptances: { customer: a.customerAcceptance, supplier: part.supplierAcceptance },
        createdAt: now(),
        updatedAt: now(),
      };
      db.contracts ||= [];
      db.contracts.unshift(c);
      contractIds.push(c.id);
      clause.recordIntroduction(r.customerId, supplier.id, r.id);
      suppliers.push({ id: supplier.id, company: supplier.company, packages: names });
      for (const u of supplierUsers(supplier.id))
        notify(
          u.id,
          { key: "brokeredOrderConfirmed", params: { title: r.title, company: customer?.company || "" } },
          `/supplier/projects/${p.id}`,
        );
    }
    a.status = "Accepted";
    Object.assign(r, { suppliers, contractIds, contractId: contractIds[0] || null });
    if (suppliers.length === 1) r.supplier = { id: suppliers[0].id, company: suppliers[0].company };
    move(r, "Contracted", { role: "admin", id: null });
    r.history.at(-1).by = "supplier";
    const companies = suppliers.map((s) => s.company).join(", ");
    notify(
      r.customerId,
      { key: "requestContracted", params: { title: r.title, company: companies } },
      `/customer/requests/${r.id}`,
    );
    for (const ad of admins())
      notify(
        ad.id,
        { key: "requestContracted", params: { title: r.title, company: companies } },
        `/admin/requests/${r.id}`,
      );
    return null;
  }
  function settle(r) {
    summarize(r);
    if (r.award.status === "Confirmed") return finalize(r);
    return null;
  }
  // What a supplier sees of its part: the work, its own price (an estimate to confirm), the customer once contracted
  function supplierOrder(r, part) {
    const db = getDb(),
      contracted = r.status === "Contracted";
    return {
      requestId: r.id,
      partId: part.id,
      title: r.title,
      description: r.description,
      category: r.category,
      region: r.sitePostcode ? r.sitePostcode.slice(0, 2) : "",
      startDate: r.startDate,
      dueDate: r.dueDate,
      estimate: !!r.award.estimate,
      fixed: !!r.award.fixed,
      units: r.booking?.units || null,
      packages: part.packageIds.map((pid) => {
        const x = r.packages.find((y) => y.id === pid);
        return { name: x?.name || "", category: x?.category || "", hours: x?.hours || 0 };
      }),
      hours: part.hours,
      amount: part.supplierAmount,
      proposedAmount: part.proposed?.supplierAmount ?? null,
      deliveryDays: part.days,
      status: contracted ? "Accepted" : part.status,
      expiresAt: part.expiresAt,
      clause: clause.current(),
      ...(contracted
        ? {
            customerCompany: db.users.find((u) => u.id === r.customerId)?.company || "",
            projectId: r.projectId,
          }
        : {}),
    };
  }
  /* ---------- T262: booking a supplier's package ---------- */
  // A booking is a request with one work package, chosen at once: the supplier confirms (or instant booking
  // confirms for it), then the usual contract, assignment and reveal follow. Returns {error, status} or {request}.
  function bookPackage(user, pkg, b, shop) {
    const units = Number(b.units ?? 1);
    if (!Number.isInteger(units) || units < 1 || units > 10)
      return { status: 400, error: "Book 1 to 10 units of the package." };
    const startDate = String(b.startDate || "");
    if (!isDate(startDate)) return { status: 400, error: "Choose the start date." };
    if (startDate < shop.earliestStart(pkg))
      return { status: 409, error: "This start is too early for the package. Choose a later date." };
    if (shop.weekFull(pkg, startDate))
      return { status: 409, error: "The supplier is fully booked that week. Choose a later start." };
    if (!shop.serves(pkg, b.sitePostcode)) return { status: 400, error: "This package is not offered for that site." };
    if (b.acceptClause !== true) return { status: 400, error: "Accept the platform contract to confirm." };
    if (b.clauseHash !== clause.current().hash)
      return { status: 409, error: "The contract terms changed. Read them again and accept them." };
    const workDays = pkg.days * units,
      hours = pkg.teamSize * workDays * 8,
      notes = text(b.notes, 2000);
    let due = new Date(startDate + "T00:00:00Z");
    for (let n = workDays - 1; n > 0; ) {
      due.setUTCDate(due.getUTCDate() + 1);
      if (due.getUTCDay() !== 0 && due.getUTCDay() !== 6) n--;
    }
    const title = units > 1 ? `${pkg.title} (×${units})` : pkg.title;
    const { error, fields } = clean(user, {
      title,
      description: pkg.description + (notes ? "\n\n" + notes : ""),
      projectId: b.projectId || "",
      startDate,
      dueDate: due.toISOString().slice(0, 10),
      sitePostcode: b.sitePostcode,
      siteCity: b.siteCity,
      packages: [{ name: title, category: pkg.category, hours }],
    });
    if (error) return { status: 400, error };
    const amount = Math.round(pkg.price * units * 100) / 100,
      r = {
        id: id("req"),
        customerId: user.id,
        customerName: user.name,
        customerCompany: user.company || "",
        ...fields,
        servicePackageId: pkg.id,
        booking: { units, unitPrice: pkg.price, notes },
        createdAt: now(),
      };
    linkProject(user, r);
    move(r, "New", user, "Package booking");
    const opt = {
      id: id("opt"),
      label: "package",
      note: "",
      supplierId: pkg.supplierId,
      supplierAmount: amount,
      price: customerPrice(amount),
      deliveryDays: workDays,
      profile: anonymousProfile(pkg.supplierId),
      attachments: [],
      chosen: true,
    };
    r.options = [opt];
    const part = newPart({
      supplierId: pkg.supplierId,
      packageIds: [r.packages[0].id],
      hours,
      estimate: amount,
      supplierAmount: amount,
      price: opt.price,
      days: workDays,
    });
    r.award = {
      optionId: opt.id,
      estimate: false,
      fixed: true,
      customerAcceptance: clause.acceptance(user, "brokered-contract"),
      status: "Waiting for supplier",
      offeredAt: now(),
      parts: [part],
    };
    summarize(r);
    move(r, "Chosen", user, "Package booking");
    list().unshift(r);
    const supplierLink = "/supplier/orders",
      params = { title: pkg.title, date: startDate };
    // Instant booking: the supplier accepted the current clause for it in advance (T262)
    if (pkg.instantBooking && pkg.instantAcceptance?.hash === clause.current().hash) {
      Object.assign(part, {
        supplierAcceptance: { ...pkg.instantAcceptance, context: "instant-booking" },
        status: "Confirmed",
        confirmedAt: now(),
      });
      const failed = settle(r);
      if (failed) return { status: 409, error: failed };
      for (const u of supplierUsers(pkg.supplierId)) notify(u.id, { key: "packageBookedInstant", params }, supplierLink);
    } else for (const u of supplierUsers(pkg.supplierId)) notify(u.id, { key: "packageBooked", params }, supplierLink);
    for (const a of admins()) notify(a.id, { key: "packageBookedAdmin", params }, `/admin/requests/${r.id}`);
    activity(user, `Booked package ${pkg.title}`);
    return { request: view(user, r) };
  }

  async function handleOrders(req, res, parts, user) {
    const method = req.method;
    if (user.role !== "supplier" || !user.supplierId)
      return (send(res, 403, { error: "Only suppliers confirm platform orders." }), true);
    expireAwards();
    const mine = list()
      .map((r) => ({ r, part: activeParts(r).find((p) => p.supplierId === user.supplierId) }))
      .filter((x) => x.part);
    if (!parts[2] && method === "GET")
      return (send(res, 200, { orders: mine.map(({ r, part }) => supplierOrder(r, part)) }), true);
    const found = mine.find((x) => x.r.id === parts[2]);
    if (!found || parts.length !== 4 || method !== "POST")
      return (send(res, 404, { error: "Order not found" }), true);
    const { r, part } = found;
    if (part.status !== "Waiting for supplier")
      return (send(res, 409, { error: "This order was already answered." }), true);
    const b = await body(req);
    if (parts[3] === "decline") {
      supplierOut(r, part, "Declined by the supplier");
      activity(user, `Declined platform order ${r.title}`);
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
    // T232: the supplier may confirm the estimate or name its own price, with a reason
    let price = null;
    if (r.award.fixed && b.price !== undefined && b.price !== null && b.price !== "" && Number(b.price) !== part.supplierAmount)
      return (send(res, 400, { error: "A package has a fixed price. Confirm it or decline." }), true);
    if (!r.award.fixed && b.price !== undefined && b.price !== null && b.price !== "") {
      price = Math.round(Number(b.price) * 100) / 100;
      if (!Number.isFinite(price) || price <= 0 || price > 100000000)
        return (send(res, 400, { error: "Enter your price in euros." }), true);
      if (price !== part.supplierAmount && !text(b.note, 1000))
        return (send(res, 400, { error: "Tell the customer why the price changes." }), true);
    }
    part.supplierAcceptance = clause.acceptance(user, "brokered-contract");
    if (price === null || price <= part.supplierAmount) {
      if (price !== null && price < part.supplierAmount)
        Object.assign(part, { supplierAmount: price, price: customerPrice(price), note: text(b.note, 1000) });
      Object.assign(part, { status: "Confirmed", confirmedAt: now() });
    } else {
      part.proposed = {
        supplierAmount: price,
        price: customerPrice(price),
        note: text(b.note, 1000),
        at: now(),
      };
      part.status = "Price changed";
      notify(
        r.customerId,
        { key: "requestPriceChanged", params: { title: r.title } },
        `/customer/requests/${r.id}`,
      );
    }
    const failed = settle(r);
    if (failed) return (send(res, 409, { error: failed }), true);
    activity(user, `Answered platform order ${r.title}`);
    save();
    return (send(res, 200, { order: supplierOrder(r, part) }), true);
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
      if (instantOn()) instantEstimate(r);
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
      // T232: one part per supplier; an operator's offer (T224) is one part for the whole request
      const allIds = r.packages.map((x) => x.id),
        parts = (
          opt.parts || [
            {
              supplierId: opt.supplierId,
              offerId: opt.offerId,
              packageIds: allIds,
              hours: r.packages.reduce((n, x) => n + x.hours, 0),
              supplierAmount: opt.supplierAmount,
              price: opt.price,
              days: opt.deliveryDays,
            },
          ]
        ).map((p) =>
          newPart({
            supplierId: p.supplierId,
            offerId: p.offerId || null,
            packageIds: p.packageIds,
            hours: p.hours,
            estimate: p.supplierAmount,
            supplierAmount: p.supplierAmount,
            price: p.price,
            days: p.days,
          }),
        );
      r.award = {
        optionId: opt.id,
        estimate: !!opt.estimate,
        customerAcceptance: clause.acceptance(user, "brokered-contract"),
        status: "Waiting for supplier",
        offeredAt: now(),
        parts,
      };
      summarize(r);
      move(r, "Chosen", user);
      for (const p of parts) offerPart(r, p);
      for (const a of admins())
        notify(a.id, { key: "requestChosen", params: { title: r.title } }, `/admin/requests/${r.id}`);
      activity(user, `Chose an option for request ${r.title}`);
      save();
      return (send(res, 200, { request: view(user, r) }), true);
    }
    // T232: the customer approves or rejects a higher price a supplier named for its part
    if (parts[3] === "parts" && parts[4] && !parts[5] && method === "POST") {
      if (user.role !== "customer")
        return (send(res, 403, { error: "Only the customer chooses an option." }), true);
      const part = activeParts(r).find((p) => p.id === parts[4]),
        b = await body(req);
      if (!part || part.status !== "Price changed")
        return (send(res, 409, { error: "This price is no longer waiting for you." }), true);
      if (b.action === "approve") {
        Object.assign(part, {
          supplierAmount: part.proposed.supplierAmount,
          price: part.proposed.price,
          note: part.proposed.note,
          status: "Confirmed",
          confirmedAt: now(),
        });
        delete part.proposed;
      } else if (b.action === "reject") supplierOut(r, part, "Price not accepted");
      else return (send(res, 400, { error: "Choose a valid action for this request." }), true);
      const failed = r.award ? settle(r) : null;
      if (failed) return (send(res, 409, { error: failed }), true);
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

  return { handle, view, move, customerPrice, anonymousProfile, bookPackage, REQUEST_STATUSES };
};
