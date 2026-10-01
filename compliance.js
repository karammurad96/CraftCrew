/**
 * On-site contractor compliance (Fremdfirmenmanagement): customer sites with document and
 * qualification requirements, supplier workers and certificates with expiry, site-specific safety
 * briefings, site access requests with work permits, check-in/out and a live on-site list.
 * Mounted by server.js; `ctx` gives access to the data store and shared helpers.
 */
const REQUIREMENTS = {
  // Company-level evidence (uploaded once by the supplier, reviewed by each customer)
  insurance: {
    scope: "company",
    label: "Public liability insurance certificate",
    de: "Betriebshaftpflicht-Nachweis",
    expires: true,
  },
  tax48b: {
    scope: "company",
    label: "Tax exemption certificate (§48b EStG)",
    de: "Freistellungsbescheinigung (§48b EStG)",
    expires: true,
  },
  bgCertificate: {
    scope: "company",
    label: "Certificate of good standing (BG / accident insurance)",
    de: "Unbedenklichkeitsbescheinigung der Berufsgenossenschaft",
    expires: true,
  },
  scc: { scope: "company", label: "SCC / SCP safety certificate", de: "SCC-/SCP-Zertifikat", expires: true },
  minimumWage: {
    scope: "company",
    label: "Minimum wage declaration (MiLoG)",
    de: "Mindestlohnerklärung (MiLoG)",
    expires: false,
  },
  // Worker-level evidence
  a1: {
    scope: "worker",
    label: "A1 certificate (workers posted from abroad)",
    de: "A1-Bescheinigung (Entsendung aus dem Ausland)",
    expires: true,
    onlyPosted: true,
  },
  electrician: {
    scope: "worker",
    label: "Qualified electrician (Elektrofachkraft)",
    de: "Nachweis Elektrofachkraft",
    expires: false,
  },
  heightFitness: {
    scope: "worker",
    label: "Fitness for work at height (G41)",
    de: "Eignung Arbeiten mit Absturzgefahr (G41)",
    expires: true,
  },
  forklift: { scope: "worker", label: "Forklift licence", de: "Staplerschein", expires: false },
  firstAid: { scope: "worker", label: "First aider training", de: "Ersthelfer-Ausbildung", expires: true },
};
const PERMITS = {
  none: { label: "No special permit", checklist: [] },
  hotWork: {
    label: "Hot work (welding, cutting, grinding)",
    checklist: [
      "Fire watch assigned",
      "Combustibles removed or covered (10 m radius)",
      "Extinguisher at the work place",
      "Fire detection section informed",
    ],
  },
  height: {
    label: "Work at height",
    checklist: ["Fall protection equipment inspected", "Area below cordoned off", "Rescue plan in place"],
  },
  electrical: {
    label: "Electrical work (isolation / LOTO)",
    checklist: [
      "Isolated and secured against reconnection",
      "Absence of voltage verified",
      "Earthed and short-circuited",
      "Adjacent live parts covered",
    ],
  },
  confinedSpace: {
    label: "Confined space entry",
    checklist: [
      "Atmosphere measured",
      "Ventilation running",
      "Attendant posted outside",
      "Rescue equipment ready",
    ],
  },
};
const BRIEFING_VALID_DAYS = 365,
  EXPIRING_DAYS = 30;

module.exports = function createCompliance(ctx) {
  const { getDb, save, send, body, id, now, notify, projectFor } = ctx;
  const today = () => new Date().toISOString().slice(0, 10);
  const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const lists = () => {
    const db = getDb();
    db.sites ||= [];
    db.workers ||= [];
    db.complianceDocs ||= [];
    db.briefingAcks ||= [];
    db.siteVisits ||= [];
    return db;
  };

  /* ---------- Relationships ---------- */
  const siteProjects = (site) => getDb().projects.filter((p) => p.siteId === site.id);
  function suppliersAtSite(site) {
    const ids = new Set();
    for (const p of siteProjects(site))
      for (const ph of p.phases) {
        if (ph.supplierId) ids.add(ph.supplierId);
        for (const t of ph.tasks || [])
          if (t.assignedSupplierId && t.acceptanceStatus !== "Declined") ids.add(t.assignedSupplierId);
      }
    for (const v of lists().siteVisits) if (v.siteId === site.id) ids.add(v.supplierId);
    return [...ids];
  }
  const customerSites = (user) => lists().sites.filter((s) => s.customerId === user.id);
  const supplierSites = (user) => lists().sites.filter((s) => suppliersAtSite(s).includes(user.supplierId));
  const customerSeesSupplier = (user, supplierId) =>
    customerSites(user).some((s) => suppliersAtSite(s).includes(supplierId)) ||
    getDb().projects.some(
      (p) =>
        projectFor(user, p.id) &&
        p.phases.some(
          (ph) =>
            ph.supplierId === supplierId || (ph.tasks || []).some((t) => t.assignedSupplierId === supplierId),
        ),
    );
  function canSeeSite(user, site) {
    if (user.role === "admin") return true;
    if (user.role === "customer") return site.customerId === user.id;
    return user.role === "supplier" && suppliersAtSite(site).includes(user.supplierId);
  }

  /* ---------- Readiness engine ---------- */
  function docState(doc, customerId) {
    if (!doc) return "Missing";
    if (doc.expiresAt && doc.expiresAt < today()) return "Expired";
    const review = doc.reviews?.[customerId];
    if (!review || review.status === "Pending review") return "Pending review";
    if (review.status === "Rejected") return "Rejected";
    if (doc.expiresAt && doc.expiresAt <= inDays(EXPIRING_DAYS)) return "Expiring";
    return "Valid";
  }
  const latestDoc = (supplierId, key, workerId = null) =>
    lists()
      .complianceDocs.filter(
        (d) => d.supplierId === supplierId && d.requirementKey === key && (d.workerId || null) === workerId,
      )
      .sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)))[0] || null;
  const ok = (state) => ["Valid", "Expiring"].includes(state);

  function readiness(site, supplierId, workerIds = null) {
    const db = lists(),
      req = site.requirements || [];
    const company = req
      .filter((k) => REQUIREMENTS[k]?.scope === "company")
      .map((k) => {
        const doc = latestDoc(supplierId, k);
        return {
          key: k,
          label: REQUIREMENTS[k].label,
          state: docState(doc, site.customerId),
          doc: doc && publicDoc(doc),
          expiresAt: doc?.expiresAt || "",
        };
      });
    const workers = db.workers
      .filter(
        (w) => w.supplierId === supplierId && w.active !== false && (!workerIds || workerIds.includes(w.id)),
      )
      .map((w) => {
        const items = req
          .filter(
            (k) =>
              REQUIREMENTS[k]?.scope === "worker" && !(REQUIREMENTS[k].onlyPosted && !w.postedFromAbroad),
          )
          .map((k) => {
            const doc = latestDoc(supplierId, k, w.id);
            return {
              key: k,
              label: REQUIREMENTS[k].label,
              state: docState(doc, site.customerId),
              doc: doc && publicDoc(doc),
              expiresAt: doc?.expiresAt || "",
            };
          });
        const ack = db.briefingAcks
          .filter((a) => a.siteId === site.id && a.workerId === w.id)
          .sort((a, b) => String(b.acknowledgedAt).localeCompare(String(a.acknowledgedAt)))[0];
        const briefing = !site.briefing?.content
          ? null
          : !ack
            ? "Missing"
            : ack.version !== site.briefing.version
              ? "Outdated"
              : ack.expiresAt < today()
                ? "Expired"
                : ack.expiresAt <= inDays(EXPIRING_DAYS)
                  ? "Expiring"
                  : "Valid";
        if (briefing)
          items.push({
            key: "briefing",
            label: "Site safety briefing",
            state: briefing,
            expiresAt: ack?.expiresAt || "",
          });
        return { workerId: w.id, name: w.name, role: w.role, items, ready: items.every((i) => ok(i.state)) };
      });
    const companyReady = company.every((i) => ok(i.state));
    return {
      siteId: site.id,
      supplierId,
      company,
      workers,
      coverage: coverageCheck(site, supplierId),
      companyReady,
      ready: companyReady && workers.every((w) => w.ready),
      expiringSoon: [...company, ...workers.flatMap((w) => w.items)].filter((i) => i.state === "Expiring")
        .length,
    };
  }
  // Liability coverage from the supplier's latest application against the site's optional minimum (a warning only).
  function coverageCheck(site, supplierId) {
    const required = Number(site.minCoverage) || 0;
    if (!required) return null;
    const app = (getDb().applications || [])
      .filter((a) => a.supplierId === supplierId)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
    const actual = Number(app?.insuranceCoverage) || 0;
    return { required, actual, below: actual < required };
  }
  function publicDoc(d) {
    const { reviews, ...rest } = d;
    return rest;
  }

  /* ---------- Daily sweep: expiring evidence ---------- */
  function sweep() {
    const db = lists();
    let changed = false;
    for (const d of db.complianceDocs) {
      if (
        d.expiresAt &&
        d.expiresAt <= inDays(EXPIRING_DAYS) &&
        d.expiresAt >= today() &&
        !d.expiryNoticeSent
      ) {
        const who = d.workerId ? db.workers.find((w) => w.id === d.workerId)?.name : "your company";
        for (const u of db.users.filter((x) => x.supplierId === d.supplierId))
          notify(
            u.id,
            `Compliance document expires on ${d.expiresAt}: ${REQUIREMENTS[d.requirementKey]?.label || d.requirementKey} (${who})`,
            "/supplier/compliance",
          );
        d.expiryNoticeSent = now();
        changed = true;
      }
    }
    if (changed) save();
  }
  setInterval(sweep, 6 * 3600000).unref();
  setTimeout(sweep, 6000).unref();

  /* ---------- API ---------- */
  async function handle(req, res, url, parts, user) {
    const method = req.method;
    if (parts[1] === "compliance" && parts[2] === "catalog" && method === "GET")
      return (send(res, 200, { requirements: REQUIREMENTS, permits: PERMITS }), true);

    // Sites
    if (parts[1] === "sites" && parts.length === 2 && method === "GET") {
      const db = lists(),
        sites =
          user.role === "admin"
            ? db.sites
            : user.role === "customer"
              ? customerSites(user)
              : user.role === "supplier"
                ? supplierSites(user)
                : [];
      return (send(res, 200, { sites: sites.map((s) => siteSummary(s, user)) }), true);
    }
    if (parts[1] === "sites" && parts.length === 2 && method === "POST") {
      if (user.role !== "customer") return (send(res, 403, { error: "Only customers manage sites" }), true);
      const b = await body(req),
        site = { id: id("site"), customerId: user.id, createdAt: now() },
        err = applySite(site, b, user);
      if (err) return (send(res, 400, { error: err }), true);
      lists().sites.unshift(site);
      save();
      return (send(res, 201, { site: siteSummary(site, user) }), true);
    }
    if (parts[1] === "sites" && parts[2] && parts.length === 3) {
      const site = lists().sites.find((s) => s.id === parts[2]);
      if (!site || !canSeeSite(user, site)) return (send(res, 404, { error: "Site not found" }), true);
      if (method === "GET") {
        const db = lists(),
          suppliers = user.role === "supplier" ? [user.supplierId] : suppliersAtSite(site);
        const onSite = db.siteVisits
          .filter(
            (v) =>
              v.siteId === site.id &&
              v.status === "Checked in" &&
              (user.role !== "supplier" || v.supplierId === user.supplierId),
          )
          .map(visitView);
        return (
          send(res, 200, {
            site: siteSummary(site, user),
            readiness: suppliers.map((sid) => ({
              ...readiness(site, sid),
              company_name: db.suppliers.find((s) => s.id === sid)?.company || "",
            })),
            onSite,
            projects: siteProjects(site)
              .filter((p) => user.role !== "supplier" || projectFor(user, p.id))
              .map((p) => ({ id: p.id, name: p.name })),
          }),
          true
        );
      }
      if (method === "PATCH") {
        if (user.role !== "customer")
          return (send(res, 403, { error: "Only the customer can change a site" }), true);
        const b = await body(req),
          err = applySite(site, b, user);
        if (err) return (send(res, 400, { error: err }), true);
        save();
        return (send(res, 200, { site: siteSummary(site, user) }), true);
      }
    }
    if (parts[1] === "sites" && parts[2] && parts[3] === "briefings" && method === "POST") {
      const site = lists().sites.find((s) => s.id === parts[2]);
      if (!site || user.role !== "supplier" || !canSeeSite(user, site))
        return (send(res, 403, { error: "You have no work at this site" }), true);
      const b = await body(req),
        worker = lists().workers.find(
          (w) => w.id === b.workerId && w.supplierId === user.supplierId && w.active !== false,
        );
      if (!worker) return (send(res, 400, { error: "Choose one of your workers" }), true);
      if (!site.briefing?.content) return (send(res, 400, { error: "This site has no briefing" }), true);
      if (
        !b.confirm ||
        String(b.signatureName || "")
          .trim()
          .toLowerCase() !== worker.name.trim().toLowerCase()
      )
        return (send(res, 400, { error: "The worker must confirm and sign with their full name" }), true);
      const ack = {
        id: id("ack"),
        siteId: site.id,
        workerId: worker.id,
        supplierId: user.supplierId,
        version: site.briefing.version,
        signatureName: String(b.signatureName).trim(),
        acknowledgedAt: now(),
        expiresAt: inDays(BRIEFING_VALID_DAYS),
        recordedBy: user.id,
      };
      lists().briefingAcks.push(ack);
      save();
      return (send(res, 201, { acknowledgement: ack }), true);
    }

    // Workers
    if (parts[1] === "workers" && parts.length === 2 && method === "GET") {
      const db = lists(),
        list =
          user.role === "supplier"
            ? db.workers.filter((w) => w.supplierId === user.supplierId)
            : user.role === "admin"
              ? db.workers
              : db.workers.filter((w) => customerSeesSupplier(user, w.supplierId));
      return (send(res, 200, { workers: list }), true);
    }
    if (
      parts[1] === "workers" &&
      ((parts.length === 2 && method === "POST") || (parts[2] && method === "PATCH"))
    ) {
      if (user.role !== "supplier")
        return (send(res, 403, { error: "Only suppliers manage their workers" }), true);
      const b = await body(req),
        db = lists();
      let w = parts[2]
        ? db.workers.find((x) => x.id === parts[2] && x.supplierId === user.supplierId)
        : { id: id("wrk"), supplierId: user.supplierId, active: true, createdAt: now() };
      if (!w) return (send(res, 404, { error: "Worker not found" }), true);
      const name = String(b.name ?? w.name ?? "").trim();
      if (!name) return (send(res, 400, { error: "Enter the worker's full name" }), true);
      Object.assign(w, {
        name: name.slice(0, 120),
        role: String(b.role ?? w.role ?? "").slice(0, 80),
        phone: String(b.phone ?? w.phone ?? "").slice(0, 40),
        postedFromAbroad: b.postedFromAbroad !== undefined ? !!b.postedFromAbroad : !!w.postedFromAbroad,
        active: b.active !== undefined ? !!b.active : w.active !== false,
        updatedAt: now(),
      });
      if (!parts[2]) db.workers.push(w);
      save();
      return (send(res, parts[2] ? 200 : 201, { worker: w }), true);
    }

    // Compliance documents
    if (parts[1] === "compliance" && parts[2] === "documents" && parts.length === 3 && method === "GET") {
      const db = lists(),
        list =
          user.role === "supplier"
            ? db.complianceDocs
                .filter((d) => d.supplierId === user.supplierId)
                .map((d) => ({ ...publicDoc(d), reviews: d.reviews }))
            : user.role === "admin"
              ? db.complianceDocs
              : db.complianceDocs
                  .filter((d) => customerSeesSupplier(user, d.supplierId))
                  .map((d) => ({
                    ...publicDoc(d),
                    review: d.reviews?.[user.id] || null,
                    supplierCompany: db.suppliers.find((s) => s.id === d.supplierId)?.company || "",
                    workerName: db.workers.find((w) => w.id === d.workerId)?.name || "",
                  }));
      return (send(res, 200, { documents: list }), true);
    }
    if (parts[1] === "compliance" && parts[2] === "documents" && parts.length === 3 && method === "POST") {
      if (user.role !== "supplier")
        return (send(res, 403, { error: "Only suppliers upload compliance documents" }), true);
      const b = await body(req),
        r = REQUIREMENTS[b.requirementKey],
        db = lists();
      if (!r) return (send(res, 400, { error: "Choose a requirement" }), true);
      if (
        r.scope === "worker" &&
        !db.workers.some((w) => w.id === b.workerId && w.supplierId === user.supplierId)
      )
        return (send(res, 400, { error: "Choose the worker this document belongs to" }), true);
      if (!b.url || !ctx.ownUpload(user, String(b.url)))
        return (send(res, 400, { error: "Upload the document file" }), true);
      if (r.expires && !/^\d{4}-\d{2}-\d{2}$/.test(String(b.expiresAt || "")))
        return (send(res, 400, { error: "Enter the expiry date" }), true);
      if (b.expiresAt && b.expiresAt < today())
        return (send(res, 400, { error: "This document has already expired" }), true);
      const doc = {
        id: id("cdoc"),
        supplierId: user.supplierId,
        workerId: r.scope === "worker" ? b.workerId : null,
        requirementKey: b.requirementKey,
        filename: String(b.filename || "document.pdf").slice(0, 200),
        url: String(b.url),
        issuedAt: String(b.issuedAt || "").slice(0, 10),
        expiresAt: r.expires ? b.expiresAt : String(b.expiresAt || "").slice(0, 10),
        uploadedAt: now(),
        uploadedBy: user.id,
        reviews: {},
      };
      db.complianceDocs.push(doc);
      const customers = new Set(
        db.sites
          .filter(
            (s) =>
              suppliersAtSite(s).includes(user.supplierId) &&
              (s.requirements || []).includes(doc.requirementKey),
          )
          .map((s) => s.customerId),
      );
      for (const cid of customers)
        notify(
          cid,
          `Compliance document to review: ${r.label} from ${db.suppliers.find((s) => s.id === user.supplierId)?.company || "a supplier"}`,
          "/customer/sites",
        );
      save();
      return (send(res, 201, { document: doc }), true);
    }
    if (parts[1] === "compliance" && parts[2] === "documents" && parts[3] && method === "PATCH") {
      const db = lists(),
        doc = db.complianceDocs.find((d) => d.id === parts[3]);
      if (!doc || user.role !== "customer" || !customerSeesSupplier(user, doc.supplierId))
        return (send(res, 404, { error: "Document not found" }), true);
      const b = await body(req);
      if (!["Accepted", "Rejected"].includes(b.status))
        return (send(res, 400, { error: "Choose Accepted or Rejected" }), true);
      if (b.status === "Rejected" && !String(b.note || "").trim())
        return (send(res, 400, { error: "Tell the supplier why the document is rejected" }), true);
      doc.reviews ||= {};
      doc.reviews[user.id] = {
        status: b.status,
        note: String(b.note || "").slice(0, 1000),
        by: user.id,
        at: now(),
      };
      for (const u of db.users.filter((x) => x.supplierId === doc.supplierId))
        notify(
          u.id,
          `${REQUIREMENTS[doc.requirementKey]?.label}: ${b.status}${b.note ? " — " + b.note : ""}`,
          "/supplier/compliance",
        );
      save();
      return (send(res, 200, { document: { ...publicDoc(doc), review: doc.reviews[user.id] } }), true);
    }

    // Site access requests, work permits, check-in/out
    if (parts[1] === "site-visits" && parts.length === 2 && method === "GET") {
      const db = lists(),
        list = db.siteVisits.filter(
          (v) =>
            user.role === "admin" ||
            (user.role === "supplier" && v.supplierId === user.supplierId) ||
            (user.role === "customer" && db.sites.find((s) => s.id === v.siteId)?.customerId === user.id),
        );
      return (
        send(res, 200, {
          visits: list.map(visitView).sort((a, b) => String(b.date).localeCompare(String(a.date))),
        }),
        true
      );
    }
    if (parts[1] === "site-visits" && parts.length === 2 && method === "POST") {
      if (user.role !== "supplier")
        return (send(res, 403, { error: "Only suppliers request site access" }), true);
      const db = lists(),
        b = await body(req),
        site = db.sites.find((s) => s.id === b.siteId);
      if (!site || !canSeeSite(user, site))
        return (send(res, 403, { error: "You have no work at this site" }), true);
      const project = b.projectId
        ? db.projects.find((p) => p.id === b.projectId && p.siteId === site.id)
        : null;
      if (b.projectId && (!project || !projectFor(user, project.id)))
        return (send(res, 400, { error: "Choose one of your projects at this site" }), true);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.date || "")) || b.date < today())
        return (send(res, 400, { error: "Choose today or a future date" }), true);
      const workerIds = [...new Set(Array.isArray(b.workerIds) ? b.workerIds : [])].filter((wid) =>
        db.workers.some((w) => w.id === wid && w.supplierId === user.supplierId && w.active !== false),
      );
      if (!workerIds.length) return (send(res, 400, { error: "Choose at least one worker" }), true);
      const permitType = PERMITS[b.permitType] ? b.permitType : "none";
      const checklist = PERMITS[permitType].checklist.map((item, i) => ({
        item,
        confirmed: !!(b.checklist || [])[i],
      }));
      if (checklist.some((c) => !c.confirmed))
        return (send(res, 400, { error: "Confirm every point of the work permit checklist" }), true);
      const visit = {
        id: id("visit"),
        siteId: site.id,
        projectId: project?.id || null,
        taskId: b.taskId || null,
        supplierId: user.supplierId,
        workerIds,
        date: b.date,
        endDate:
          /^\d{4}-\d{2}-\d{2}$/.test(String(b.endDate || "")) && b.endDate >= b.date ? b.endDate : b.date,
        permitType,
        checklist,
        description: String(b.description || "").slice(0, 1000),
        status: "Requested",
        requestedBy: user.id,
        createdAt: now(),
        events: [{ status: "Requested", by: user.id, at: now() }],
      };
      visit.readinessAtRequest = readiness(site, user.supplierId, workerIds).ready;
      db.siteVisits.unshift(visit);
      notify(
        site.customerId,
        `Site access requested for ${site.name} on ${visit.date} (${workerIds.length} worker(s))${visit.readinessAtRequest ? "" : " — compliance incomplete"}`,
        "/customer/sites",
      );
      save();
      return (send(res, 201, { visit: visitView(visit) }), true);
    }
    if (parts[1] === "site-visits" && parts[2] && method === "PATCH") {
      const db = lists(),
        v = db.siteVisits.find((x) => x.id === parts[2]),
        site = v && db.sites.find((s) => s.id === v.siteId);
      if (!v || !site) return (send(res, 404, { error: "Access request not found" }), true);
      const b = await body(req),
        isCustomer = user.role === "customer" && site.customerId === user.id,
        isSupplier = user.role === "supplier" && v.supplierId === user.supplierId;
      const move = (status, extra = {}) => {
        v.status = status;
        Object.assign(v, extra);
        v.events.push({ status, by: user.id, at: now(), note: String(b.note || "").slice(0, 500) });
      };
      if (b.action === "approve" && isCustomer && v.status === "Requested") {
        const r = readiness(site, v.supplierId, v.workerIds);
        if (!r.ready && !String(b.overrideReason || "").trim())
          return (
            send(res, 409, {
              error: "Compliance is incomplete. Enter a reason to approve anyway.",
              readiness: r,
            }),
            true
          );
        move("Approved", {
          approvedBy: user.id,
          approvedAt: now(),
          override: r.ready ? null : String(b.overrideReason).slice(0, 500),
        });
        for (const u of db.users.filter((x) => x.supplierId === v.supplierId))
          notify(u.id, `Site access approved: ${site.name} on ${v.date}`, "/supplier/compliance");
      } else if (b.action === "reject" && isCustomer && ["Requested", "Approved"].includes(v.status)) {
        if (!String(b.note || "").trim()) return (send(res, 400, { error: "Enter a reason" }), true);
        move("Rejected");
        for (const u of db.users.filter((x) => x.supplierId === v.supplierId))
          notify(u.id, `Site access rejected: ${site.name} on ${v.date} — ${b.note}`, "/supplier/compliance");
      } else if (b.action === "checkin" && (isCustomer || isSupplier) && v.status === "Approved") {
        if (today() < v.date || today() > v.endDate)
          return (send(res, 400, { error: `Check-in is possible from ${v.date} to ${v.endDate}` }), true);
        move("Checked in", { checkedInAt: now() });
      } else if (b.action === "checkout" && (isCustomer || isSupplier) && v.status === "Checked in") {
        move("Checked out", { checkedOutAt: now() });
      } else if (b.action === "cancel" && isSupplier && ["Requested", "Approved"].includes(v.status)) {
        move("Cancelled");
      } else return (send(res, 400, { error: "This action is not possible for this access request" }), true);
      save();
      return (send(res, 200, { visit: visitView(v) }), true);
    }
    return false;
  }

  function applySite(site, b, user) {
    const name = String(b.name ?? site.name ?? "").trim();
    if (!name) return "Enter a site name";
    const requirements = Array.isArray(b.requirements)
      ? [...new Set(b.requirements.filter((k) => REQUIREMENTS[k]))]
      : site.requirements || ["insurance", "minimumWage"];
    let minCoverage = site.minCoverage ?? null;
    if (b.minCoverage !== undefined) {
      minCoverage = b.minCoverage === null || b.minCoverage === "" ? null : Number(b.minCoverage);
      if (minCoverage !== null && (!Number.isFinite(minCoverage) || minCoverage < 0 || minCoverage > 1e10))
        return "Enter the minimum liability coverage in euros, or leave it empty";
    }
    const content = String(b.briefingContent ?? site.briefing?.content ?? "").slice(0, 20000);
    const briefingChanged = content !== (site.briefing?.content || "");
    Object.assign(site, {
      name: name.slice(0, 140),
      address: String(b.address ?? site.address ?? "").slice(0, 240),
      contactName: String(b.contactName ?? site.contactName ?? "").slice(0, 120),
      contactPhone: String(b.contactPhone ?? site.contactPhone ?? "").slice(0, 40),
      emergencyNumber: String(b.emergencyNumber ?? site.emergencyNumber ?? "").slice(0, 40),
      requirements,
      minCoverage,
      permitTypes: Array.isArray(b.permitTypes)
        ? b.permitTypes.filter((k) => PERMITS[k] && k !== "none")
        : site.permitTypes || [],
      updatedAt: now(),
    });
    // Changing the briefing text creates a new version: workers must acknowledge it again.
    site.briefing = {
      content,
      version: briefingChanged
        ? (site.briefing?.version || 0) + 1
        : site.briefing?.version || (content ? 1 : 0),
      updatedAt: briefingChanged ? now() : site.briefing?.updatedAt || null,
    };
    if (Array.isArray(b.projectIds)) {
      const db = getDb();
      for (const p of db.projects)
        if (projectFor(user, p.id)) {
          if (b.projectIds.includes(p.id)) p.siteId = site.id;
          else if (p.siteId === site.id) p.siteId = null;
        }
    }
    return null;
  }
  function siteSummary(site, user) {
    const db = lists(),
      visits = db.siteVisits.filter((v) => v.siteId === site.id);
    const base = {
      ...site,
      projectIds: siteProjects(site).map((p) => p.id),
      supplierCount: suppliersAtSite(site).length,
      onSiteCount: visits
        .filter((v) => v.status === "Checked in")
        .reduce((a, v) => a + v.workerIds.length, 0),
      pendingRequests: visits.filter((v) => v.status === "Requested").length,
    };
    if (user.role === "supplier") return { ...base, readiness: readiness(site, user.supplierId) };
    return base;
  }
  function visitView(v) {
    const db = getDb(),
      site = (db.sites || []).find((s) => s.id === v.siteId);
    return {
      ...v,
      siteName: site?.name || "",
      supplierCompany: db.suppliers.find((s) => s.id === v.supplierId)?.company || "",
      projectName: db.projects.find((p) => p.id === v.projectId)?.name || "",
      workers: v.workerIds.map((wid) => {
        const w = (db.workers || []).find((x) => x.id === wid);
        return { id: wid, name: w?.name || "Former worker", role: w?.role || "" };
      }),
      permitLabel: PERMITS[v.permitType]?.label || "",
      ready: site ? readiness(site, v.supplierId, v.workerIds).ready : false,
    };
  }
  /* Who may download a compliance file (used by the /uploads guard in server.js). */
  function canAccessFile(user, fileUrl) {
    const doc = (getDb().complianceDocs || []).find((d) => d.url === fileUrl);
    if (!doc || !user) return false;
    return (
      user.role === "admin" ||
      (user.role === "supplier" && user.supplierId === doc.supplierId) ||
      (user.role === "customer" && customerSeesSupplier(user, doc.supplierId))
    );
  }
  /* Scorecard hook: expired or rejected evidence counts as a risk signal. */
  function supplierRisk(supplierId) {
    const docs = (getDb().complianceDocs || []).filter((d) => d.supplierId === supplierId);
    const expired = docs.filter((d) => d.expiresAt && d.expiresAt < today()).length;
    return expired ? [{ level: "medium", text: `${expired} compliance document(s) expired` }] : [];
  }

  return { handle, readiness, canAccessFile, supplierRisk, REQUIREMENTS, PERMITS };
};
