// Consolidated browser-feedback improvements, loaded after the base workflow layer.
const reviewEsc = (s) => esc(s ?? "");
const reviewProjects = async () => (await api("/projects")).projects || [];
const reviewGeo = (location) => {
  const s = String(location || "").toLowerCase();
  const cities = [
    ["regensburg", 49.013, 12.102],
    ["nuremberg", 49.452, 11.077],
    ["munich", 48.137, 11.576],
    ["münchen", 48.137, 11.576],
    ["vienna", 48.208, 16.373],
    ["eindhoven", 51.441, 5.469],
    ["prague", 50.075, 14.438],
    ["lyon", 45.764, 4.835],
    ["cairo", 30.044, 31.236],
    ["dubai", 25.205, 55.271],
    ["dresden", 51.05, 13.738],
    ["barcelona", 41.387, 2.168],
    ["amman", 31.953, 35.91],
    ["turin", 45.07, 7.687],
    ["istanbul", 41.008, 28.978],
    ["berlin", 52.52, 13.405],
    ["hamburg", 53.551, 9.993],
    ["frankfurt", 50.11, 8.682],
    ["stuttgart", 48.775, 9.182],
    ["warsaw", 52.23, 21.012],
    ["milan", 45.464, 9.19],
    ["paris", 48.857, 2.352],
    ["london", 51.507, -0.128],
    ["amsterdam", 52.368, 4.904],
    ["stockholm", 59.329, 18.069],
    ["zurich", 47.377, 8.541],
    ["czech", 49.8, 15.5],
    ["germany", 51.2, 10.4],
    ["austria", 47.6, 14.1],
    ["netherlands", 52.2, 5.3],
    ["france", 46.2, 2.2],
    ["egypt", 26.8, 30.8],
    ["uae", 24.2, 54.4],
    ["jordan", 31.2, 36.2],
    ["italy", 42.8, 12.6],
    ["spain", 40.4, -3.7],
    ["turkiye", 39, 35],
  ];
  const found = cities.find(([k]) => s.includes(k));
  return found ? [found[1], found[2]] : [50.8, 10.2];
};
function reviewTokens(s) {
  return String(s || "")
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}
function reviewScore(s, query) {
  const fields = [
      s.company,
      s.location,
      ...(s.services || []),
      ...(s.serviceCatalog || []).map((x) => x.name + " " + x.category),
      ...(s.certifications || []),
      ...(s.teamMembers || []).flatMap((x) => [x.name, x.role, x.certifications]),
      s.description,
    ].map((x) => String(x || "").toLowerCase()),
    joined = fields.join(" "),
    tokens = reviewTokens(query);
  if (!tokens.length) return 0;
  let score = 0;
  for (const token of tokens) {
    const exact = fields.some((x) => reviewTokens(x).includes(token));
    if (exact) score += 5;
    else if (joined.includes(token)) score += 3;
    else {
      let best = 0;
      for (const word of joined.split(/[^a-z0-9]+/)) {
        if (Math.min(token.length, word.length) < 4) continue;
        let common = 0;
        for (let i = 0; i < token.length - 1; i++) if (word.includes(token.slice(i, i + 2))) common++;
        best = Math.max(best, common / Math.max(token.length - 1, 1));
      }
      score += best > 0.55 ? 1 : 0;
    }
  }
  return score;
}
async function renderSuppliers() {
  const all = (await api("/suppliers")).suppliers || [],
    q = reviewQuery().get("q") || "",
    service = reviewQuery().get("service") || "",
    badge = reviewQuery().get("badge") || "",
    available = reviewQuery().get("available") === "1",
    view = reviewQuery().get("view") || localStorage.getItem("cc_supplier_view") || "grid",
    tokens = reviewTokens(q),
    scored = all
      .map((s) => ({ s, score: reviewScore(s, q) }))
      .filter((x) => !tokens.length || x.score > 0)
      .sort((a, b) => b.score - a.score || Number(b.s.rating || 0) - Number(a.s.rating || 0));
  let rows = scored
    .map((x) => x.s)
    .filter(
      (s) =>
        (!service || (s.services || []).includes(service)) &&
        (!badge || s.badge === badge) &&
        (!available || s.availability === "Available"),
    );
  const approximate = !!q && !rows.some((s) => reviewScore(s, q) >= tokens.length * 4);
  const svc = [...new Set(all.flatMap((s) => s.services || []))].sort(),
    nav = (v) =>
      `/${state.user?.role === "customer" ? "customer/" : ""}suppliers?q=${encodeURIComponent(q)}&service=${encodeURIComponent(service)}&badge=${encodeURIComponent(badge)}&available=${available ? "1" : "0"}&view=${v}`;
  const card = (s) =>
    `<article class="supplier-card review-supplier-card" role="button" tabindex="0" onclick="supplierDetail('${reviewEsc(s.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();supplierDetail('${reviewEsc(s.id)}')}"><div class="supplier-top"><div class="supplier-avatar">${reviewEsc(s.avatar || "CC")}</div><div class="supplier-card-main"><h3>${reviewEsc(s.company)}</h3><small>${reviewEsc(s.location || "Location not set")}</small></div><span class="badge ${(s.badge || "none").toLowerCase()}">${reviewEsc(supplierBadge(s))}</span></div><p>${
      (s.services || [])
        .slice(0, 4)
        .map((x) => `<span class="chip">${reviewEsc(x)}</span>`)
        .join("") || '<span class="muted">Services being updated</span>'
    }</p><div class="supplier-facts"><span>${Number(s.employees) || 0} team</span><span>${Number(s.experience) || 0}+ years</span><span>${money(s.hourlyRate || 0)}/h</span></div><div class="supplier-meta"><span>★ ${Number(s.rating || 0).toFixed(1)} · ${Number(s.projectsCompleted) || 0} projects</span><button type="button" class="btn small outline" onclick="event.stopPropagation();supplierDetail('${reviewEsc(s.id)}')">View profile</button></div></article>`;
  const listing =
    view === "list"
      ? `<div class="review-supplier-list">${
          rows
            .map(
              (s) =>
                `<article class="review-supplier-row"><div class="supplier-avatar">${reviewEsc(s.avatar || "CC")}</div><div><b>${reviewEsc(s.company)}</b><small>${reviewEsc(s.location || "Location not set")}</small></div><div>${(
                  s.services || []
                )
                  .slice(0, 3)
                  .map((x) => `<span class="chip">${reviewEsc(x)}</span>`)
                  .join(
                    "",
                  )}</div><span>★ ${Number(s.rating || 0).toFixed(1)} · ${Number(s.projectsCompleted) || 0} projects</span><button class="btn small outline" onclick="supplierDetail('${reviewEsc(s.id)}')">View profile</button></article>`,
            )
            .join("") || '<div class="empty">No suppliers match. Try a broader search.</div>'
        }</div>`
      : view === "map"
        ? reviewMap(rows, card)
        : `<div class="supplier-grid">${rows.map(card).join("") || '<div class="empty">No suppliers match. Try a broader search.</div>'}</div>`;
  const customer = state.user?.role === "customer",
    content = `<div class="cc-page"><div class="page-head"><div><div class="eyebrow">SUPPLIER DIRECTORY</div><h1>Find the right industrial specialist.</h1><p>Explore services, workforce, experience, certifications, pricing and location.</p></div>${customer ? "" : `<button class="btn outline" onclick="navigate('/supplier-application')">Apply as supplier</button>`}</div><form class="review-supplier-filters" id="reviewSupplierSearch"><label class="review-search">Search<input id="sq" value="${reviewEsc(q)}" placeholder="Try “SPS Germany” or “PLC controls”"></label><label>Service<select id="ss"><option value="">All services</option>${svc.map((x) => `<option value="${reviewEsc(x)}" ${service === x ? "selected" : ""}>${reviewEsc(x)}</option>`).join("")}</select></label><label>Badge<select id="sb"><option value="">All badges</option>${["Gold", "Silver", "Bronze", "None"].map((x) => `<option ${badge === x ? "selected" : ""}>${x}</option>`).join("")}</select></label><label class="review-available"><input id="sa" type="checkbox" ${available ? "checked" : ""}> Available only</label><button class="btn primary">Search</button></form><div class="review-directory-toolbar"><span>${rows.length} suppliers${approximate ? " · closest matching suppliers" : ""}</span><div class="review-view-toggle">${[
      ["grid", "Grid"],
      ["list", "List"],
      ["map", "Map"],
    ]
      .map(
        ([v, l]) =>
          `<button class="btn small ${view === v ? "primary" : "outline"}" onclick="event.preventDefault();reviewSetSupplierView('${v}')">${l}</button>`,
      )
      .join(
        "",
      )}</div></div>${approximate ? '<div class="notice">No exact match for every search word. Showing closest suppliers by company, service and location.</div>' : ""}${listing}</div>`;
  app.innerHTML = customer ? dashboardShell("customer", "suppliers", content) : publicLayout(content);
  document.getElementById("reviewSupplierSearch").onsubmit = (e) => {
    e.preventDefault();
    const query = new URLSearchParams({
      q: document.getElementById("sq").value,
      service: document.getElementById("ss").value,
      badge: document.getElementById("sb").value,
      available: document.getElementById("sa").checked ? "1" : "0",
      view,
    });
    navigate(`/${customer ? "customer/" : ""}suppliers?${query}`);
    renderSuppliers();
  };
}
function reviewQuery() {
  return new URLSearchParams(location.hash.split("?")[1] || "");
}
function reviewSetSupplierView(v) {
  localStorage.setItem("cc_supplier_view", v);
  const q = reviewQuery();
  q.set("view", v);
  navigate(`/${state.user?.role === "customer" ? "customer/" : ""}suppliers?${q}`);
  renderSuppliers();
}
function reviewMap(suppliers, card) {
  const pts = suppliers
    .map((s, i) => {
      const [lat, lon] = reviewGeo(s.location),
        x = Math.max(25, Math.min(975, ((lon + 180) / 360) * 1000)),
        y = Math.max(20, Math.min(480, ((90 - lat) / 180) * 500));
      return `<g class="review-map-point" tabindex="0" role="button" aria-label="${reviewEsc(s.company)}, ${reviewEsc(s.location)}" onclick="supplierDetail('${reviewEsc(s.id)}')"><circle cx="${x}" cy="${y}" r="9"></circle><text x="${x + 11}" y="${y - 8}">${reviewEsc(s.company).slice(0, 20)}</text><title>${reviewEsc(s.company)} · ${reviewEsc(s.location)}</title></g>`;
    })
    .join("");
  return `<div class="review-map-wrap"><div class="review-map" id="reviewMap"><svg viewBox="0 0 1000 500" role="img" aria-label="Interactive supplier locations map"><rect width="1000" height="500" rx="18" fill="#eaf2fb"/><path class="land" d="M85 92l75-40 84 15 38 40-25 43-58 12-30 44-46-18-9-45-40-18zm159 141l58 4 28 46-19 85-31 49-25-42 9-50-30-48zm185-174l71-30 73 23 15 37 80-8 83 33 59-4 81 41 24 47-42 34-61-12-43 39-39-7-17 61-36 15-18-37-49-4-22-54-38-19-19-56-44 10-38-30-57 10-40-46zm372 244l71-20 59 25-21 63-79 15-40-39z"/><g>${pts}</g></svg><div class="review-map-controls"><button class="btn small" onclick="reviewMapZoom(1.2)">+</button><button class="btn small" onclick="reviewMapZoom(.83)">−</button><button class="btn small" onclick="reviewMapZoom(1,true)">Reset</button></div></div><div class="review-map-results">${suppliers.map(card).join("") || '<div class="empty">No supplier locations to show.</div>'}</div></div>`;
}
function reviewMapZoom(f, reset = false) {
  const svg = document.querySelector("#reviewMap svg");
  if (!svg) return;
  let z = Number(svg.dataset.zoom || 1);
  z = reset ? 1 : Math.max(1, Math.min(4, z * f));
  svg.dataset.zoom = z;
  svg.style.transform = `scale(${z})`;
}

async function supplierDetail(id) {
  const { supplier: s } = await api("/suppliers/" + encodeURIComponent(id)),
    // Visitors who are not signed in have no projects; loading them would fail with 401.
    projects = state.token ? await reviewProjects() : [],
    catalog = s.serviceCatalog || [],
    certs = s.certifications || [];
  const back = `/${state.user?.role === "customer" ? "customer/" : ""}suppliers`,
    party = state.user?.role === "customer";
  const serviceRows = catalog.length
    ? catalog
        .map(
          (x) =>
            `<tr><td><b>${reviewEsc(x.name)}</b><small>${reviewEsc(x.category || "Service")}</small></td><td>${reviewEsc(x.description || "Scope on request")}</td><td>${money(x.rate || 0)} / ${reviewEsc(x.unit || "hour")}</td><td>${reviewEsc(x.capacity || "By agreement")}<small>${reviewEsc(x.leadTime || "Schedule on request")}</small></td><td>${party ? `<button class="btn small primary" onclick="requestSupplierQuote('${reviewEsc(s.id)}','${reviewEsc(x.name)}')">Request service</button>` : ""}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="5"><div class="notice">This supplier has not published service positions yet.</div>${party ? `<button class="btn small primary" onclick="requestSupplierQuote('${reviewEsc(s.id)}','')">Contact supplier about a specific service</button>` : ""}</td></tr>`;
  const projectOpts = projects
    .map((p) => `<option value="${reviewEsc(p.id)}">${reviewEsc(p.name)}</option>`)
    .join("");
  const content = `<button class="btn small outline review-back" onclick="navigate('${back}')">← Back to supplier directory</button><div class="supplier-profile-head"><div class="supplier-avatar large">${reviewEsc(s.avatar || "CC")}</div><div><div class="eyebrow">SUPPLIER PROFILE</div><h1>${reviewEsc(s.company)}</h1><p>${reviewEsc(s.location || "Location not set")} · ${reviewEsc(s.availability || "Availability on request")}</p></div><span class="badge ${(s.badge || "none").toLowerCase()}">${reviewEsc(supplierBadge(s))}</span></div><div class="health"><div class="cc-card"><span class="cc-label">Team</span><b>${Number(s.employees) || 0} employees · ${(s.teamMembers || []).length} key people</b></div><div class="cc-card"><span class="cc-label">Experience</span><b>${Number(s.experience) || 0}+ years · ${Number(s.projectsCompleted) || 0} projects</b></div><div class="cc-card"><span class="cc-label">Starting rates</span><b>${money(s.hourlyRate || 0)}/hour · from ${money(s.projectRate || 0)}</b></div></div>${ccReliability(s, true)}<section class="panel"><div class="panel-title"><div><h2>Published services</h2><small>Request a service directly and link it to a project work item.</small></div></div><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Service</th><th>Scope</th><th>Rate</th><th>Capacity / lead time</th><th></th></tr></thead><tbody>${serviceRows}</tbody></table></div></section><div class="supplier-profile-grid"><section class="cc-card"><h2>About</h2><p>${reviewEsc(s.description || "Supplier profile and capabilities.")}</p><h3>Certifications & skills</h3><div>${certs.map((x) => `<span class="chip">${reviewEsc(x)}</span> <button class="btn small outline" onclick="requestSupplierEvidence('${reviewEsc(s.id)}','${reviewEsc(x)}')">Request proof</button>`).join("") || '<p class="muted">No credentials listed yet.</p>'}</div>${party ? `<button class="btn small outline" style="margin-top:10px" onclick="requestSupplierEvidence('${reviewEsc(s.id)}','')">Request evidence of a skill or certification</button>` : ""}</section><section class="cc-card"><h2>Team & delivery</h2>${(s.teamMembers || []).map((m) => `<div class="team-row"><b>${reviewEsc(m.name)}</b><span>${reviewEsc(m.role)}</span><small>${reviewEsc(m.experience || "")} · ${reviewEsc(m.certifications || "")}</small></div>`).join("") || '<p class="muted">Detailed team profiles are available on request.</p>'}<h3>Customer reviews</h3>${(s.reviews || []).map((r) => `<div class="notice">★ ${reviewEsc(r.rating)} — ${reviewEsc(r.text)}</div>`).join("") || '<p class="muted">No reviews yet.</p>'}</section></div>`;
  app.innerHTML = party
    ? dashboardShell("customer", "suppliers", `<div class="cc-page">${content}</div>`)
    : publicLayout(`<div class="cc-page">${content}</div>`);
}
async function requestSupplierQuote(supplierId, serviceName = "") {
  const { supplier: s } = await api("/suppliers/" + encodeURIComponent(supplierId)),
    projects = await reviewProjects();
  reviewRequestForm(s, projects, serviceName, "service");
}
async function requestSupplierEvidence(supplierId, certName = "") {
  const { supplier: s } = await api("/suppliers/" + encodeURIComponent(supplierId)),
    projects = await reviewProjects();
  reviewRequestForm(s, projects, certName, "evidence");
}
function reviewRequestForm(s, projects, initial, kind) {
  const tasks = projects.flatMap((p) =>
    p.phases.flatMap((ph) => (ph.tasks || []).map((t) => ({ p, ph, t }))),
  );
  const isEvidence = kind === "evidence";
  modal(
    isEvidence ? "Request certification / skill evidence" : "Contact supplier for a service",
    `<form id="reviewSupplierRequest" class="modal-form"><p class="modal-intro">${isEvidence ? "Ask the supplier to provide a certificate or demonstrate a specific skill." : "Describe the service you need. The supplier will receive it in Quote Requests."}</p><label>${isEvidence ? "Certificate or skill" : "Service requested"}<input name="service" value="${reviewEsc(initial || "")}" placeholder="${isEvidence ? "e.g. TÜV functional safety certificate" : "e.g. robot-cell commissioning"}" required></label><label>Project (optional)<select id="reviewRequestProject" name="projectId"><option value="">General request</option>${projects.map((p) => `<option value="${reviewEsc(p.id)}">${reviewEsc(p.name)}</option>`).join("")}</select></label><label>Link to task (optional)<select name="taskRef"><option value="">No task selected</option>${tasks.map((x) => `<option value="${x.p.id}|${x.ph.id}|${x.t.id}">${reviewEsc(x.p.name)} · ${reviewEsc(x.ph.name)} · ${reviewEsc(x.t.name)}</option>`).join("")}</select></label><label>Details<textarea name="message" rows="4" maxlength="5000" required placeholder="Scope, deadline, required evidence and relevant context"></textarea></label><div id="reviewSupplierRequestError" class="form-error" role="alert"></div><button class="btn primary">Send request</button></form>`,
  );
  document.getElementById("reviewSupplierRequest").onsubmit = async (e) => {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(e.target)),
      [projectId, phaseId, taskId] = (b.taskRef || "").split("|");
    delete b.taskRef;
    if (projectId) {
      b.projectId = projectId;
      b.phaseId = phaseId;
      b.taskId = taskId;
    }
    b.supplierId = s.id;
    b.kind = isEvidence ? "Evidence request" : "Service request";
    try {
      await api("/rfqs", { method: "POST", body: b });
      closeModal();
      toast(
        isEvidence
          ? "Evidence request sent"
          : "Service request sent; the supplier will see it in Quote Requests",
      );
    } catch (x) {
      document.getElementById("reviewSupplierRequestError").textContent = x.message;
    }
  };
}

function reviewInvoiceScope() {
  const q = reviewQuery(),
    out = new URLSearchParams();
  for (const k of ["project", "phase", "task", "back"]) if (q.has(k)) out.set(k, q.get(k));
  return out;
}
function reviewInvoiceUrl(role, id) {
  return `/${role}/invoice/${encodeURIComponent(id)}?back=${encodeURIComponent(location.hash.replace(/^#/, ""))}`;
}
async function wfDownloadInvoice(id, kind = "pdf") {
  try {
    const r = await fetch(
      `/api/invoices/${encodeURIComponent(id)}/${kind === "email" ? "email-draft" : kind === "xrechnung" ? "xrechnung" : "pdf"}`,
      { credentials: "same-origin" },
    );
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e.error || "Could not prepare invoice file");
    }
    const blob = await r.blob(),
      a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download =
      r.headers.get("Content-Disposition")?.match(/filename="?([^";]+)"?/)?.[1] ||
      `CraftCrew-${id}.${kind === "email" ? "eml" : kind === "xrechnung" ? "xml" : "pdf"}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    if (kind === "email")
      toast(
        "Email draft with the invoice PDF attached was downloaded. Open it in your mail app to review and send.",
      );
  } catch (e) {
    toast(e.message, "error");
  }
}
async function wfInvoicePrint(id) {
  return wfDownloadInvoice(id, "pdf");
}
async function wfInvoiceEmail(id) {
  return wfDownloadInvoice(id, "email");
}
function reviewInvoiceCsv(invoices) {
  const cols = [
    "Invoice",
    "Issued",
    "Customer",
    "Supplier",
    "Project",
    "Task",
    "Amount EUR",
    "Order cap EUR",
    "Status",
  ];
  const quote = (x) => '"' + String(x ?? "").replace(/"/g, '""') + '"';
  const rows = invoices.map((i) => [
    invNo(i),
    i.createdAt,
    i.customerCompany,
    i.supplierCompany,
    i.projectName || i.projectId,
    i.taskName,
    i.amount,
    i.orderedAmount,
    i.status,
  ]);
  const blob = new Blob(["\uFEFF" + [cols, ...rows].map((r) => r.map(quote).join(";")).join("\r\n")], {
      type: "text/csv;charset=utf-8",
    }),
    a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "craftcrew-invoices.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
async function customerInvoices() {
  return reviewInvoiceList("customer");
}
async function supplierInvoices() {
  return reviewInvoiceList("supplier");
}
async function reviewInvoiceList(role) {
  const q = reviewQuery(),
    scope = reviewInvoiceScope(),
    params = new URLSearchParams(scope);
  const [d, pd] = await Promise.all([api("/invoices?" + params.toString()), api("/projects")]),
    projects = pd.projects || [],
    contacts = (await api("/contacts").catch(() => ({ users: [] }))).users || [],
    projectMap = new Map(projects.map((p) => [p.id, p]));
  const status = q.get("status") || "All",
    party = q.get("party") || "All",
    projectFilter = q.get("projectFilter") || "",
    search = (q.get("q") || "").toLowerCase(),
    min = q.get("min") || "",
    max = q.get("max") || "",
    from = q.get("from") || "",
    to = q.get("to") || "",
    sort = q.get("sort") || "date-desc";
  const invoices = d.invoices
    .map((i) => ({
      ...i,
      projectName: projectMap.get(i.projectId)?.name || i.projectId,
      partyName:
        role === "customer"
          ? i.supplierCompany || contacts.find((x) => x.supplierId === i.supplierId)?.company || "Supplier"
          : i.customerCompany || contacts.find((x) => x.id === i.customerId)?.company || "Customer",
    }))
    .filter(
      (i) =>
        (status === "All" || i.status === status) &&
        (party === "All" || i.partyName === party) &&
        (!projectFilter || i.projectId === projectFilter) &&
        (!search ||
          [i.id, invNo(i), i.projectName, i.taskName, i.partyName, i.description]
            .join(" ")
            .toLowerCase()
            .includes(search)) &&
        (min === "" || Number(i.amount) >= Number(min)) &&
        (max === "" || Number(i.amount) <= Number(max)) &&
        (!from || String(i.createdAt).slice(0, 10) >= from) &&
        (!to || String(i.createdAt).slice(0, 10) <= to),
    );
  const sortFns = {
    "date-desc": (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)),
    "date-asc": (a, b) => String(a.createdAt).localeCompare(String(b.createdAt)),
    "amount-desc": (a, b) => Number(b.amount) - Number(a.amount),
    "amount-asc": (a, b) => Number(a.amount) - Number(b.amount),
    status: (a, b) => a.status.localeCompare(b.status),
    project: (a, b) => a.projectName.localeCompare(b.projectName),
  };
  invoices.sort(sortFns[sort] || sortFns["date-desc"]);
  const all = (await api("/invoices?" + scope.toString())).invoices,
    amountTotal = invoices.reduce((a, i) => a + Number(i.amount || 0), 0),
    statuses = ["All", "Submitted", "Approved", "Changes Requested", "Rejected", "Paid"],
    parties = [
      ...new Set(
        all.map((i) => (role === "customer" ? i.supplierCompany : i.customerCompany)).filter(Boolean),
      ),
    ],
    sums = [
      ["Visible invoices", invoices.length],
      ["Visible total", money(amountTotal)],
      ["Awaiting review", all.filter((i) => i.status === "Submitted").length],
      ["Over order cap", all.filter((i) => i.exceedsOrder).length],
    ];
  const keep = (q) => {
    const next = new URLSearchParams(scope);
    for (const k of ["status", "party", "projectFilter", "q", "min", "max", "from", "to", "sort"])
      if (q[k]) next.set(k, q[k]);
    navigate(`/${role}/invoices?${next}`);
    reviewInvoiceList(role);
  };
  const content = `${q.has("back") ? `<button class="btn small outline review-back" onclick="navigate(decodeURIComponent('${encodeURIComponent(q.get("back"))}'))">← Back to previous page</button>` : ""}<div class="dash-top"><div><h1>${scope.has("project") ? "Project invoices" : "Invoices & payments"}</h1><p>Search, compare, open, export and review professional invoice records.</p></div><div class="cc-actions"><button class="btn outline" onclick="reviewInvoiceCsv(${JSON.stringify(invoices).replace(/"/g, "&quot;")})">Export CSV</button>${role === "supplier" ? '<button class="btn primary" onclick="navigate(\'/supplier/invoices/new\')">+ Create invoice</button>' : ""}</div></div><div class="wf-stat-grid">${sums.map(([label, value]) => `<div class="cc-card"><span class="cc-label">${label}</span><b>${value}</b></div>`).join("")}</div><form id="reviewInvoiceFilters" class="review-invoice-filters"><label>Find<input name="q" value="${reviewEsc(search)}" placeholder="Invoice, project, task or company"></label><label>Status<select name="status">${statuses.map((x) => `<option ${status === x ? "selected" : ""}>${x}</option>`).join("")}</select></label><label>${role === "customer" ? "Supplier" : "Customer"}<select name="party"><option>All</option>${parties.map((x) => `<option ${party === x ? "selected" : ""}>${reviewEsc(x)}</option>`).join("")}</select></label><label>Project<select name="projectFilter"><option value="">All projects</option>${projects.map((p) => `<option value="${reviewEsc(p.id)}" ${projectFilter === p.id ? "selected" : ""}>${reviewEsc(p.name)}</option>`).join("")}</select></label><label>From<input name="from" type="date" value="${reviewEsc(from)}"></label><label>To<input name="to" type="date" value="${reviewEsc(to)}"></label><label>Min €<input name="min" type="number" min="0" step="0.01" value="${reviewEsc(min)}"></label><label>Max €<input name="max" type="number" min="0" step="0.01" value="${reviewEsc(max)}"></label><label>Sort by<select name="sort">${[
    ["date-desc", "Newest"],
    ["date-asc", "Oldest"],
    ["amount-desc", "Amount: high to low"],
    ["amount-asc", "Amount: low to high"],
    ["status", "Status"],
    ["project", "Project"],
  ]
    .map(([v, l]) => `<option value="${v}" ${sort === v ? "selected" : ""}>${l}</option>`)
    .join(
      "",
    )}</select></label><button class="btn primary">Apply filters</button><button type="button" class="btn outline" onclick="navigate('/${role}/invoices${scope.toString() ? `?${scope}` : ""}');${role === "customer" ? "customerInvoices()" : "supplierInvoices()"}">Reset</button></form><section class="panel"><div class="cc-table-wrap"><table class="cc-table review-invoice-table"><thead><tr><th>Invoice</th><th>Customer / supplier</th><th>Project / phase / task</th><th>Positions</th><th>Amount / cap</th><th>Status</th><th>Actions</th></tr></thead><tbody>${
    invoices
      .map((i) => {
        const p = projectMap.get(i.projectId),
          ph = p?.phases.find((x) => x.id === i.phaseId);
        return `<tr><td><b><a href="#${reviewInvoiceUrl(role, i.id)}">${reviewEsc(invNo(i))}</a></b><small>${date(i.createdAt)}</small>${rvDue(i) ? `<small>Due ${date(rvDue(i))}</small>` : ""}</td><td>${reviewEsc(i.partyName)}<small>${role === "customer" ? reviewEsc(i.supplierEmail || "Supplier") : "Customer account"}</small></td><td>${reviewEsc(i.projectName)}<small>${reviewEsc(ph?.name || i.phaseId)} · ${reviewEsc(i.taskName || "Phase invoice")}</small></td><td>${(i.lineItems || []).length || "—"}</td><td>${money(i.amount)}${i.orderedAmount ? `<small class="${i.exceedsOrder ? "danger-text" : "success-text"}">${i.exceedsOrder ? "Over by " + money(invNet(i) - i.orderedAmount) : "of " + money(i.orderedAmount)}</small>` : ""}</td><td><span class="status ${i.status.toLowerCase().replaceAll(" ", "-")}">${reviewEsc(i.status)}</span>${rvInvoiceTiming(i, role)}</td><td><div class="cc-actions"><a class="btn small outline" href="#${reviewInvoiceUrl(role, i.id)}">View</a>${role === "customer" && i.status === "Submitted" ? `<button class="btn small success" onclick="reviewInvoice('${i.id}')">Review</button>` : ""}${role === "supplier" && ["Changes Requested", "Rejected"].includes(i.status) ? `<button class="btn small primary" onclick="rvFixInvoice('${i.id}')">Fix & resubmit</button>` : ""}<button class="btn small outline" onclick="wfInvoicePrint('${i.id}')">PDF</button><button class="btn small outline" onclick="wfInvoiceEmail('${i.id}')">Email</button></div></td></tr>`;
      })
      .join("") || '<tr><td colspan="7">No invoices match these filters.</td></tr>'
  }</tbody></table></div></section>`;
  app.innerHTML = dashboardShell(role, "invoices", content);
  document.getElementById("reviewInvoiceFilters").onsubmit = (e) => {
    e.preventDefault();
    keep(Object.fromEntries(new FormData(e.target)));
  };
}
async function reviewInvoice(id) {
  const { invoice: i } = await api("/invoices/" + encodeURIComponent(id));
  location.hash = "#" + reviewInvoiceUrl(state.user.role, id);
  invoiceDetailPage(id);
}
// The date an open invoice is due (T108): its payment date once approved, before that the due date of its terms.
const rvDue = (i) =>
  ["Submitted", "Approved", "Changes Requested"].includes(i.status) ? i.scheduledPayment || i.dueDate || "" : "";
// Suppliers see how long an invoice has waited for review; approved invoices past their payment date are overdue,
// and so are invoices still in review after their due date.
function rvInvoiceTiming(i, role) {
  if (i.status === "Approved" && i.overdue) return ` <span class="status overdue">${dsDaysLate(i.scheduledPayment)}</span>`;
  if (i.status === "Submitted" && i.dueDate && i.dueDate < dsToday())
    return ` <span class="status overdue">${dsDaysLate(i.dueDate)}</span>`;
  if (role !== "supplier" || i.status !== "Submitted") return "";
  const days = Math.floor((Date.now() - Date.parse(i.resubmittedAt || i.createdAt)) / 86400000);
  return `<small>${days < 1 ? "Waiting for review since today" : `Waiting for review since ${days} day${days === 1 ? "" : "s"}`}</small>`;
}
// Legal VAT notes, as printed on the PDF.
const RV_VAT_NOTES = {
  reverseCharge13b: "Reverse charge: the recipient of the service is liable for VAT (§13b UStG).",
  smallBusiness19: "No VAT is charged under the small-business rule (§19 UStG).",
  intraEU: "Reverse charge: intra-EU service, VAT is payable by the recipient.",
};
// Net, VAT and gross rows; invoices from before VAT was recorded show net amounts only.
function rvVatRows(i) {
  if (!i.vatMode)
    return `<div>Subtotal <b>${money(i.amount)}</b></div><div>Tax / VAT <small>Net amounts – VAT not recorded</small></div><div class="grand">Total due <b>${money(i.amount)}</b></div>`;
  return `<div>Net amount <b>${money(i.netAmount)}</b></div><div><span>Value added tax <small>${Number(i.vatRate)} %</small></span> <b>${money(i.vatAmount)}</b></div><div class="grand">Total due <b>${money(i.grossAmount)}</b></div>`;
}
async function invoiceDetailPage(id) {
  const [d, pd] = await Promise.all([api("/invoices/" + encodeURIComponent(id)), reviewProjects()]),
    i = d.invoice,
    p = pd.find((x) => x.id === i.projectId),
    ph = p?.phases.find((x) => x.id === i.phaseId),
    task = ph?.tasks?.find((x) => x.id === i.taskId),
    q = reviewQuery(),
    back = q.get("back") || `/${state.user.role}/invoices`,
    lines = (i.lineItems || [])
      .map(
        (x) =>
          `<tr><td><b>${reviewEsc(x.service)}</b></td><td>${Number(x.quantity)} ${reviewEsc(x.unit || "units")}</td><td>${money(x.unitPrice || x.rate || 0)}</td><td>${money(x.total || Number(x.quantity || 0) * Number(x.unitPrice || x.rate || 0))}</td></tr>`,
      )
      .join(""),
    over = Number(i.orderedAmount) > 0 && invNet(i) > Number(i.orderedAmount);
  const content = `<button class="btn small outline review-back" onclick="navigate(decodeURIComponent('${encodeURIComponent(back)}'))">← Back to invoices</button><div class="dash-top"><div><div class="eyebrow">INVOICE DETAIL</div><h1>${reviewEsc(invNo(i))}</h1><p>${reviewEsc(i.status)} · issued ${date(i.createdAt)}</p></div><div class="cc-actions"><button class="btn outline" onclick="wfInvoicePrint('${i.id}')">Download PDF</button><button class="btn outline" onclick="wfDownloadInvoice('${i.id}','xrechnung')">Download e-invoice (XRechnung)</button><button class="btn outline" onclick="wfInvoiceEmail('${i.id}')">Email</button></div></div><section class="panel invoice-paper"><div class="invoice-paper-head"><div><div class="eyebrow">SUPPLIER / ISSUER</div><h2>${reviewEsc(i.supplierCompany)}</h2><p>${reviewEsc(i.supplierAddress || "Address not provided")}<br>${reviewEsc(i.supplierEmail || "")}<br>VAT / Tax ID: ${reviewEsc(i.supplierTaxId || "—")}</p></div><div><div class="eyebrow">BILL TO</div><h2>${reviewEsc(i.customerCompany)}</h2><p>${reviewEsc(i.customerAddress || "Address not provided")}<br>${reviewEsc(i.customerEmail || "")}<br>VAT / Tax ID: ${reviewEsc(i.customerTaxId || "—")}</p></div><div class="invoice-paper-no"><span>INVOICE</span><b>${reviewEsc(invNo(i))}</b><small>Date ${date(i.createdAt)}</small><small>Status: ${reviewEsc(i.status)}</small></div></div><div class="wf-stat-grid"><div class="cc-card"><span class="cc-label">Project</span><b>${reviewEsc(p?.name || i.projectId)}</b></div><div class="cc-card"><span class="cc-label">Phase</span><b>${reviewEsc(ph?.name || i.phaseId)}</b></div><div class="cc-card"><span class="cc-label">Task</span><b>${reviewEsc(task?.name || i.taskName || "Phase invoice")}</b></div>${i.serviceDateFrom ? `<div class="cc-card"><span class="cc-label">${i.serviceDateTo && i.serviceDateTo !== i.serviceDateFrom ? "Service period" : "Service date"}</span><b>${date(i.serviceDateFrom)}${i.serviceDateTo && i.serviceDateTo !== i.serviceDateFrom ? " – " + date(i.serviceDateTo) : ""}</b></div>` : ""}</div><h3>Invoice positions</h3><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Description</th><th>Quantity</th><th>Unit rate</th><th>Line total</th></tr></thead><tbody>${lines || `<tr><td>${reviewEsc(i.description || "Services delivered")}</td><td>1 unit</td><td>${money(i.amount)}</td><td>${money(i.amount)}</td></tr>`}</tbody></table></div><div class="invoice-totals">${rvVatRows(i)}<div>Approved order cap <b>${money(i.orderedAmount || 0)}</b></div></div>${over ? `<div class="notice order-warning">This invoice is ${money(invNet(i) - i.orderedAmount)} over the task order cap.</div>` : ""}${RV_VAT_NOTES[i.vatMode] ? `<div class="notice"><b>${RV_VAT_NOTES[i.vatMode]}</b></div>` : ""}<div class="notice">${reviewEsc(i.description || "No additional notes.")} · Payment terms: ${reviewEsc(i.paymentTerms || (i.paymentTermsDays != null ? `${i.paymentTermsDays} days net.` : "As agreed in the project order."))}</div>${i.comments ? `<div class="notice ${["Changes Requested", "Rejected"].includes(i.status) ? "warn" : ""}"><b>${i.status === "Rejected" ? "Rejected" : "Changes requested"}:</b> ${reviewEsc(i.comments)}</div>` : ""}${i.resubmitNote && i.status === "Submitted" ? `<div class="notice">Corrected by the supplier: ${reviewEsc(i.resubmitNote)}</div>` : ""}${state.user.role === "supplier" && ["Changes Requested", "Rejected"].includes(i.status) ? `<div class="action-row"><button class="btn primary" onclick="rvFixInvoice('${i.id}')">Fix & resubmit invoice</button></div>` : ""}${(i.revisions || []).length ? rvRevisionList(i.revisions) : ""}${state.user.role === "customer" && i.status === "Submitted" ? `<div class="action-row"><button class="btn success" onclick="invoiceAction('${i.id}','Approve')">Approve & schedule payment</button><button class="btn outline" onclick="invoiceAction('${i.id}','Request Changes')">Request changes</button><button class="btn danger" onclick="invoiceReject('${i.id}')">Reject</button></div>` : ""}</section>`;
  app.innerHTML = dashboardShell(state.user.role, "invoices", content);
}
window.wfInvoiceView = invoiceDetailPage;
async function reviewInviteBid(bidId) {
  const suppliers = (await api("/suppliers")).suppliers || [],
    already = (await api("/bids")).bids.find((x) => x.id === bidId)?.invitedSupplierIds || [];
  modal(
    "Invite suppliers to this task bid",
    `<form id="reviewInviteForm" class="modal-form"><p class="modal-intro">Search companies and invite specific suppliers. Only invited suppliers can submit offers for this request.</p><label>Search suppliers<input id="reviewInviteSearch" placeholder="Company, service or location"></label><div class="review-invite-list">${suppliers.map((s) => `<label class="review-invite-row" data-search="${reviewEsc([s.company, s.location, ...(s.services || [])].join(" ").toLowerCase())}"><input type="checkbox" name="supplierIds" value="${reviewEsc(s.id)}" ${already.includes(s.id) ? "checked disabled" : ""}><span><b>${reviewEsc(s.company)}</b><small>${reviewEsc(s.location)} · ${(s.services || []).slice(0, 3).map(reviewEsc).join(", ")}</small></span><span class="badge ${(s.badge || "none").toLowerCase()}">${reviewEsc(supplierBadge(s))}</span></label>`).join("") || "<p>No active suppliers are available.</p>"}</div><button class="btn primary">Send bid invitations</button></form>`,
  );
  document.getElementById("reviewInviteSearch").oninput = (e) => {
    const q = e.target.value.toLowerCase();
    document
      .querySelectorAll(".review-invite-row")
      .forEach((r) => (r.hidden = !r.dataset.search.includes(q)));
  };
  document.getElementById("reviewInviteForm").onsubmit = async (e) => {
    e.preventDefault();
    const supplierIds = [...new FormData(e.target).getAll("supplierIds")].filter(Boolean);
    if (!supplierIds.length) {
      toast("Select at least one supplier", "error");
      return;
    }
    try {
      await api(`/bids/${bidId}/invitations`, { method: "POST", body: { supplierIds } });
      closeModal();
      toast("Bid invitation sent");
      wfOffers();
    } catch (x) {
      toast(x.message, "error");
    }
  };
}
async function reviewConfirmBid(id, offerId, action) {
  const text =
    action === "Accept offer"
      ? "Awarding confirms this task will be assigned to the selected supplier. Other offers will be marked not selected. Continue?"
      : "Closing bidding will stop new offers and close outstanding offers. Continue?";
  if (!(await uiConfirm(text))) return;
  wfBidDecision(id, offerId, action);
}
async function wfBidDecision(id, offerId, action) {
  try {
    await api("/bids/" + id, { method: "PATCH", body: { offerId, action } });
    toast(
      action === "Accept offer"
        ? "Supplier selected and task assigned"
        : action === "Close bid"
          ? "Bidding closed"
          : "Offer updated",
    );
    await wfOffers();
  } catch (e) {
    toast(e.message, "error");
  }
}
async function reviewBidStage(id, status) {
  try {
    await api("/bids/" + id, { method: "PATCH", body: { action: "Set status", status } });
    toast(`Bid moved to ${status}`);
    wfOffers();
  } catch (e) {
    toast(e.message, "error");
  }
}
async function reviewOfferTalk(bidId, offerId) {
  const bid = (await api("/bids")).bids.find((x) => x.id === bidId),
    offer = bid?.offers?.find((x) => x.id === offerId);
  if (!offer) return;
  const questions = offer.clarifications || [];
  modal(
    state.user.role === "customer" ? "Request offer details" : "Clarification thread",
    `<div class="review-chat-log">${questions.map((m) => `<article><b>${reviewEsc(m.authorName)}</b><p>${reviewEsc(m.text)}</p><small>${date(m.createdAt)}</small></article>`).join("") || '<div class="empty">No clarification messages yet.</div>'}</div><form id="reviewClarifyForm" class="modal-form"><label>${state.user.role === "customer" ? "Question for supplier" : "Reply to customer"}<textarea name="text" maxlength="3000" required></textarea></label><button class="btn primary">${state.user.role === "customer" ? "Ask for details" : "Send reply"}</button></form>`,
  );
  document.getElementById("reviewClarifyForm").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api(`/bids/${bidId}/clarifications`, {
        method: "POST",
        body: { offerId, text: new FormData(e.target).get("text") },
      });
      closeModal();
      wfOffers();
    } catch (x) {
      toast(x.message, "error");
    }
  };
}
async function wfSupplierBid(pid, phid, tid) {
  const d = await api("/bids"),
    open = d.bids.filter(
      (b) =>
        b.projectId === pid &&
        b.taskId === tid &&
        ["Open", "Shortlist", "Second round", "Final round"].includes(b.status),
    );
  const content = open.length
    ? open
        .map(
          (b) =>
            `<article class="cc-card"><span class="status active">${reviewEsc(b.status)} · due ${date(b.dueDate)}</span><h3>${reviewEsc(b.title)}</h3><p>${reviewEsc(b.description)}</p>${b.invitedSupplierIds?.length ? "<small>Invitation only</small>" : ""}<form class="wf-offer-form" onsubmit="event.preventDefault();wfSubmitOffer('${b.id}',this)"><div class="two"><label>Total offer (€)<input name="amount" type="number" min="1" step="0.01" required></label><label>Delivery days<input name="deliveryDays" type="number" min="1" required></label></div><label>Included scope & assumptions<textarea name="notes" maxlength="3000"></textarea></label><label>Attach offer document<input name="offerFile" type="file" accept=".pdf,.doc,.docx,.xlsx,.xls,.png,.jpg"></label><button class="btn primary">Submit / revise offer</button></form></article>`,
        )
        .join("")
    : '<div class="empty">There are no active bid requests for this task.</div>';
  modal("Supplier offer", content);
}
async function wfSubmitOffer(id, form) {
  const b = Object.fromEntries(new FormData(form)),
    file = form.querySelector("[name=offerFile]")?.files?.[0];
  try {
    if (file) {
      const uploaded = await uploadFile(file);
      b.attachment = uploaded.url;
    }
    delete b.offerFile;
    await api(`/bids/${id}/offers`, { method: "POST", body: b });
    closeModal();
    toast("Offer and supporting document sent to customer");
    await wfOffers();
  } catch (e) {
    toast(e.message, "error");
  }
}
async function wfOffers() {
  await bmEnsure();
  const d = await api("/bids"),
    projects = await reviewProjects(),
    contacts = (await api("/contacts").catch(() => ({ users: [] }))).users || [],
    q = reviewQuery(),
    project = q.get("project") || "",
    status = q.get("status") || "All",
    sort = q.get("offerSort") || "amount",
    allBids = d.bids || [];
  let bids = allBids.filter(
    (x) => (!project || x.projectId === project) && (status === "All" || x.status === status),
  );
  const active = bids.filter((x) =>
      ["Open", "Shortlist", "Second round", "Final round"].includes(x.status),
    ).length,
    waiting = bids.filter((x) => !x.offers?.length).length,
    received = bids.reduce(
      (n, x) => n + (x.offers || []).filter((o) => ["Submitted", "Accepted"].includes(o.status)).length,
      0,
    ),
    awarded = bids.filter((x) => x.status === "Awarded").length,
    offersCount = bids.reduce((n, x) => n + (x.offers || []).length, 0),
    sorter = {
      amount: (a, b) => Number(a.amount) - Number(b.amount),
      delivery: (a, b) => Number(a.deliveryDays) - Number(b.deliveryDays),
      experience: (a, b) =>
        Number(b.workingTogether || b.projectsCompleted || 0) -
        Number(a.workingTogether || a.projectsCompleted || 0),
    };
  const projectBy = new Map(projects.map((p) => [p.id, p]));
  const cards =
    bids
      .map((b) => {
        const p = projectBy.get(b.projectId),
          task = p?.phases.flatMap((ph) => ph.tasks || []).find((t) => t.id === b.taskId),
          offers = (b.offers || [])
            .map((o) => {
              const prior = projects.filter(
                (px) =>
                  px.id !== b.projectId &&
                  px.phases.some(
                    (ph) =>
                      ph.supplierId === o.supplierId ||
                      (ph.tasks || []).some((t) => t.assignedSupplierId === o.supplierId),
                  ),
              ).length;
              return { ...o, workingTogether: prior };
            })
            .sort(sorter[sort] || sorter.amount);
        const stageOptions = ["Open", "Shortlist", "Second round", "Final round"];
        if (["Awarded", "Closed"].includes(b.status)) stageOptions.push(b.status);
        return `<article class="panel wf-bid-card review-bid-card"><div class="project-card-head"><div><span class="eyebrow">${reviewEsc(p?.name || b.projectName || "Project")}</span><h3>${reviewEsc(b.title)}</h3><small>${reviewEsc(b.phaseName || "")} · ${reviewEsc(task?.name || b.taskName || "Task")}</small></div>${state.user.role === "customer" ? `<label class="review-stage">Stage<select onchange="reviewBidStage('${b.id}',this.value)">${stageOptions.map((x) => `<option ${b.status === x ? "selected" : ""}>${x}</option>`).join("")}</select></label>` : `<span class="status ${b.status === "Open" ? "submitted" : "active"}">${reviewEsc(b.status)}</span>`}</div><p>${reviewEsc(b.description)}</p>${
          (b.attachments || []).length
            ? `<div class="dir-bid-files">${b.attachments
                .map(
                  (u, i) =>
                    `<a class="btn small outline" href="${reviewEsc(u)}" target="_blank" rel="noopener">📎 ${reviewEsc(
                      u
                        .split("/")
                        .pop()
                        .replace(/^[^_]+_[^_]+_/, "") || "File " + (i + 1),
                    )}</a>`,
                )
                .join("")}</div>`
            : ""
        }<div class="wf-task-meta"><span>Deadline ${date(b.dueDate)}</span><span>${offers.length} offers</span><span>${(b.invitedSupplierIds || []).length} invited</span></div>${offers.length ? `<div class="review-offer-sort"><span>Compare offers</span><select aria-label="Sort offers" onchange="reviewSetOfferSort(this.value)"><option value="amount" ${sort === "amount" ? "selected" : ""}>Lowest price</option><option value="delivery" ${sort === "delivery" ? "selected" : ""}>Fastest delivery</option><option value="experience" ${sort === "experience" ? "selected" : ""}>Prior projects</option></select></div><div class="wf-offer-table"><div class="wf-offer-head"><span>Supplier / relationship</span><span>Offer</span><span>Delivery</span><span>Decision</span></div>${offers.map((o, i) => `<div class="wf-offer-row"><b>${i === 0 && sort !== "experience" ? "★ " : ""}${reviewEsc(o.supplierCompany)}<small>${o.workingTogether} prior project${o.workingTogether === 1 ? "" : "s"} together</small></b><strong>${money(o.amount)}${o.hourlyRate ? bmRateNote(o.hourlyRate, b.category || b.taskName) : ""}</strong><span>${Number(o.deliveryDays) || "—"} days</span><span>${reviewEsc(o.status)}</span><small>${reviewEsc(o.notes || "No scope note")}</small>${o.attachment ? `<a class="btn small outline" href="${reviewEsc(o.attachment)}" target="_blank">Offer document</a>` : ""}${(o.clarifications || []).length ? `<small>${o.clarifications.length} clarification message(s)</small>` : ""}<div class="cc-actions">${state.user.role === "customer" && ["Submitted", "Accepted"].includes(o.status) ? `<button class="btn small outline" onclick="reviewOfferTalk('${b.id}','${o.id}')">Ask for details</button>` : ""}${state.user.role === "supplier" && o.supplierId === state.user.supplierId ? `<button class="btn small outline" onclick="reviewOfferTalk('${b.id}','${o.id}')">Clarifications / reply</button>` : ""}${state.user.role === "customer" && ["Submitted", "Accepted"].includes(o.status) && !["Awarded", "Closed"].includes(b.status) ? `<button class="btn small success" onclick="reviewConfirmBid('${b.id}','${o.id}','Accept offer')">Award task</button>${o.status === "Submitted" ? `<button class="btn small outline" onclick="rvRequestOfferChanges('${b.id}','${o.id}')">Request changes</button>` : ""}<button class="btn small outline" onclick="wfBidDecision('${b.id}','${o.id}','Decline offer')">Eliminate</button>` : ""}${state.user.role === "supplier" && o.supplierId === state.user.supplierId && o.status === "Changes requested" ? `<button class="btn small primary" onclick="ccOpenBidOffer('${b.id}')">Revise offer</button>` : ""}${o.changeNote && o.status === "Changes requested" ? `<small class="rv-change-note">Changes requested: ${reviewEsc(o.changeNote)}</small>` : ""}</div></div>`).join("")}</div>` : '<div class="notice">Waiting for supplier offers.</div>'}${state.user.role === "customer" && ["Open", "Shortlist", "Second round", "Final round"].includes(b.status) ? `<div class="cc-actions"><button class="btn small outline" onclick="reviewInviteBid('${b.id}')">+ Invite suppliers</button><button class="btn small outline" onclick="reviewConfirmBid('${b.id}','','Close bid')">Close bidding</button></div>` : ""}${b.status === "Awarded" ? '<div class="notice success-text">One supplier is assigned to this task. Other offers are closed.</div>' : ""}</article>`;
      })
      .join("") || '<div class="empty">No offers match these filters.</div>';
  const content = `<div class="dash-top"><div><h1>${state.user.role === "customer" ? "Offers overview" : "Task bid opportunities"}</h1><p>Compare supplier price, delivery, scope and prior work; award one supplier per task.</p></div>${state.user.role === "customer" ? '<button class="btn primary" onclick="wfCreateBidFromPage()">+ Request bids for a task</button>' : '<button class="btn outline" onclick="navigate(\'/supplier/requests\')">Quote requests</button>'}</div><div class="wf-stat-grid review-offer-stats">${[
    ["Bid requests", bids.length],
    ["Open rounds", active],
    ["Offers received", received],
    ["Awaiting offers", waiting],
    ["Tasks awarded", awarded],
    ["Total proposals", offersCount],
  ]
    .map(([a, v]) => `<div class="cc-card"><span class="cc-label">${a}</span><b>${v}</b></div>`)
    .join(
      "",
    )}</div><div class="wf-filter-row review-offer-filters"><label>Project<select id="wfBidProject" onchange="wfBidFilter()"><option value="">All projects</option>${projects.map((p) => `<option value="${p.id}" ${project === p.id ? "selected" : ""}>${reviewEsc(p.name)}</option>`).join("")}</select></label><label>Status<select id="wfBidStatus" onchange="wfBidFilter()">${["All", "Open", "Shortlist", "Second round", "Final round", "Awarded", "Closed"].map((x) => `<option ${status === x ? "selected" : ""}>${x}</option>`).join("")}</select></label><label>Sort offers<select onchange="reviewSetOfferSort(this.value)"><option value="amount" ${sort === "amount" ? "selected" : ""}>Lowest price</option><option value="delivery" ${sort === "delivery" ? "selected" : ""}>Fastest delivery</option><option value="experience" ${sort === "experience" ? "selected" : ""}>Prior projects</option></select></label></div><div class="wf-bid-grid review-bid-grid">${cards}</div>`;
  app.innerHTML = dashboardShell(
    state.user.role,
    state.user.role === "customer" ? "offers" : "bids",
    content,
  );
}
function reviewSetOfferSort(sort) {
  const q = reviewQuery();
  q.set("offerSort", sort);
  navigate(`/${state.user.role}/offers?${q}`);
  wfOffers();
}
async function supplierPhases() {
  const d = await reviewProjects(),
    s = (await api("/profile")).supplier,
    items = [];
  for (const p of d)
    for (const ph of p.phases || [])
      for (const t of ph.tasks || []) if (t.assignedSupplierId === s?.id) items.push({ p, ph, t });
  app.innerHTML = dashboardShell(
    "supplier",
    "phases",
    `<div class="dash-top"><div><h1>Assigned work</h1><p>Task invitations, supplier commitments, documentation and progress.</p></div><button class="btn outline" onclick="navigate('/supplier/bids')">Find more work</button></div><div class="review-work-grid">${
      items
        .map(
          (x) =>
            `<article class="panel review-work-card"><div class="project-card-head"><div><span class="eyebrow">${reviewEsc(x.p.name)} · ${reviewEsc(x.ph.name)}</span><h3>${reviewEsc(x.t.name)}</h3></div><span class="status ${String(
              x.t.status || "Not Started",
            )
              .toLowerCase()
              .replaceAll(
                " ",
                "-",
              )}">${reviewEsc(x.t.status || "Not Started")}</span></div><p>${reviewEsc(x.t.description || "")}</p><div class="wf-task-meta"><span>${date(x.t.startDate)} → ${date(x.t.dueDate)}</span><span>${reviewEsc(x.t.acceptanceStatus || "Assigned")}</span><span>${Number(x.t.progress) || 0}% complete</span></div><div class="timeline-line"><i style="width:${Math.min(100, Number(x.t.progress) || 0)}%"></i></div><div class="cc-actions"><button class="btn small outline" onclick="wfUpdateProgress('${x.p.id}','${x.ph.id}','${x.t.id}',${Number(x.t.progress) || 0})">Update progress</button><button class="btn small outline" onclick="navigate('/supplier/projects/${x.p.id}/documents?phase=${x.ph.id}&task=${x.t.id}')">Documents</button><button class="btn small outline" onclick="navigate('/supplier/invoices?project=${x.p.id}&phase=${x.ph.id}&task=${x.t.id}&back='+encodeURIComponent('/supplier/projects/${x.p.id}'))">Invoices</button><button class="btn small outline" onclick="navigate('/supplier/messages?project=${x.p.id}&phase=${x.ph.id}&task=${x.t.id}&back='+encodeURIComponent('/supplier/projects/${x.p.id}'))">Messages</button></div></article>`,
        )
        .join("") || '<div class="empty">No assignable tasks yet. Browse task bids to find work.</div>'
    }</div>`,
  );
}
async function messages(role) {
  const projects = await reviewProjects(),
    list = (await api("/chats")).chats || [],
    id = reviewQuery().get("chat") || "",
    active = list.find((x) => x.id === id) || list[0],
    details = active ? await api(`/chats/${active.id}/messages`) : null;
  const label = (chat) => {
    const p = projects.find((x) => x.id === chat.projectId),
      ph = p?.phases.find((x) => x.id === chat.phaseId),
      task = ph?.tasks?.find((x) => x.id === chat.taskId);
    return [p?.name, ph?.name, task?.name].filter(Boolean).join(" · ");
  };
  const body = active
    ? `<div class="review-chat-header"><div><span class="eyebrow">${reviewEsc(label(active) || "Project conversation")}</span><h2>${reviewEsc(active.title)}</h2><small>${(active.members || []).map((x) => reviewEsc(x.name)).join(" · ")}</small></div><div class="cc-actions">${active.projectId ? `<a class="btn small outline" href="#/${role}/projects/${reviewEsc(active.projectId)}">Open project</a>` : ""}<button class="btn small outline" onclick="reviewNewChat()">+ New chat</button></div></div><div class="review-chat-messages" id="reviewChatMessages">${(details.messages || []).map((m) => `<article class="review-chat-message ${m.senderId === state.user.id ? "mine" : ""}"><b>${m.senderId === state.user.id ? "You" : reviewEsc((active.members || []).find((x) => x.id === m.senderId)?.name || "Participant")}</b><p>${reviewEsc(m.text)}</p><small>${date(m.createdAt)}</small></article>`).join("") || '<div class="empty">Start the conversation with a message.</div>'}</div><form id="reviewChatCompose" class="review-chat-compose"><textarea name="text" rows="2" maxlength="5000" placeholder="Write a message…" required></textarea><button class="btn primary">Send</button></form>`
    : `<div class="review-chat-empty"><div class="feature-icon">✉</div><h2>Your project conversations</h2><p>Start a private chat with a project contact, or create a phase, task or group conversation.</p><button class="btn primary" onclick="reviewNewChat()">+ New chat</button></div>`;
  app.innerHTML = dashboardShell(
    role,
    "messages",
    `<div class="dash-top"><div><h1>Messages</h1><p>Private project chats, grouped around the work and the people doing it.</p></div><button class="btn primary" onclick="reviewNewChat()">+ New chat</button></div><section class="review-chat-layout"><aside class="review-chat-list"><div class="review-chat-list-title">Chats <span>${list.length}</span></div>${list.map((c) => `<a class="review-chat-thread ${active?.id === c.id ? "selected" : ""}" href="#/${role}/messages?chat=${encodeURIComponent(c.id)}"><b>${reviewEsc(c.title)}</b><small>${reviewEsc(label(c) || "Project chat")}</small><small>${reviewEsc(c.members?.map((x) => x.name).join(", ") || "Participants")}</small><p>${reviewEsc(c.lastMessage?.text || "No messages yet")}</p></a>`).join("") || '<div class="empty">No chats yet.</div>'}</aside><section class="review-chat-main">${body}</section></section>`,
  );
  if (active) {
    const box = document.getElementById("reviewChatMessages");
    box.scrollTop = box.scrollHeight;
    document.getElementById("reviewChatCompose").onsubmit = async (e) => {
      e.preventDefault();
      const text = new FormData(e.target).get("text");
      try {
        await api(`/chats/${active.id}/messages`, { method: "POST", body: { text } });
        await messages(role);
      } catch (x) {
        toast(x.message, "error");
      }
    };
  }
}
async function reviewNewChat() {
  const projects = await reviewProjects(),
    contacts = (await api("/contacts")).users || [];
  if (!projects.length) {
    toast("Create or join a project before starting a project chat", "error");
    return;
  }
  modal(
    "Start a project chat",
    `<form class="modal-form" id="reviewNewChatForm"><label>Project<select name="projectId" id="reviewChatProject" required>${projects.map((p) => `<option value="${reviewEsc(p.id)}">${reviewEsc(p.name)}</option>`).join("")}</select></label><label>Conversation is about<select name="context"><option value="project">Project</option><option value="phase">Phase</option><option value="task">Task</option></select></label><label>Phase / task (optional)<select name="taskRef"><option value="">Project-wide chat</option>${projects.flatMap((p) => p.phases.flatMap((ph) => (ph.tasks || []).map((t) => `<option value="${p.id}|${ph.id}|${t.id}">${reviewEsc(p.name)} · ${reviewEsc(ph.name)} · ${reviewEsc(t.name)}</option>`))).join("")}</select></label><label>Chat name<input name="title" maxlength="120" placeholder="e.g. Installation coordination"></label><label>Add participants (choose one for a private chat or several for a group)<select name="participantIds" multiple size="6" required>${contacts.map((x) => `<option value="${reviewEsc(x.id)}">${reviewEsc(x.name)} — ${reviewEsc(x.company || x.role)}</option>`).join("")}</select></label><div id="reviewChatError" class="form-error" role="alert"></div><button class="btn primary">Create chat</button></form>`,
  );
  document.getElementById("reviewNewChatForm").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target),
      ref = String(fd.get("taskRef") || "").split("|"),
      projectId = ref[0] || fd.get("projectId"),
      phaseId = ref[1] || "",
      taskId = ref[2] || "",
      participantIds = [...e.target.elements.participantIds.selectedOptions].map((x) => x.value),
      title = fd.get("title");
    try {
      const { chat } = await api("/chats", {
        method: "POST",
        body: { projectId, phaseId, taskId, participantIds, title },
      });
      closeModal();
      navigate(`/${roleForChat()}/messages?chat=${encodeURIComponent(chat.id)}`);
      messages(state.user.role);
    } catch (x) {
      document.getElementById("reviewChatError").textContent = x.message;
    }
  };
}
function roleForChat() {
  return state.user.role;
}
async function adminUsers() {
  const [d, sd] = await Promise.all([api("/admin/users"), api("/admin/suppliers")]),
    roles = d.users || [],
    su = new Map((sd.suppliers || []).map((s) => [s.id, s]));
  app.innerHTML = dashboardShell(
    "admin",
    "users",
    `<div class="dash-top"><div><h1>Users & supplier badges</h1><p>Review accounts and assign the public supplier verification badge.</p></div></div><section class="panel"><div class="panel-title"><h3>Supplier directory badges</h3><span>${sd.suppliers.length} suppliers</span></div><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Supplier</th><th>Location</th><th>Account</th><th>Current badge</th><th>Change badge</th></tr></thead><tbody>${
      sd.suppliers
        .map((s) => {
          const account = roles.find((u) => u.supplierId === s.id);
          return `<tr><td><b>${reviewEsc(s.company)}</b><small>${s.live ? "Live in directory" : "Not live"}</small></td><td>${reviewEsc(s.location || "—")}</td><td>${reviewEsc(account?.email || "No linked account")}</td><td>${reviewEsc(supplierBadge(s))}</td><td><select aria-label="Badge for ${reviewEsc(s.company)}" onchange="reviewChangeBadge('${s.id}',this.value)">${["None", "Bronze", "Silver", "Gold"].map((x) => `<option ${x === (s.badge || "None") ? "selected" : ""}>${x}</option>`).join("")}</select></td></tr>`;
        })
        .join("") || '<tr><td colspan="5">No supplier companies yet.</td></tr>'
    }</tbody></table></div></section><section class="panel"><div class="panel-title"><h3>Accounts</h3><span>${roles.length} users</span></div><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Company</th></tr></thead><tbody>${roles.map((u) => `<tr><td>${reviewEsc(u.name)}</td><td>${reviewEsc(u.email)}</td><td><span class="tag">${reviewEsc(u.role)}</span></td><td>${reviewEsc(u.company || "—")}</td></tr>`).join("")}</tbody></table></div></section>`,
  );
}
async function supplierRequests() {
  const d = await api("/rfqs"),
    rows = d.rfqs || [];
  app.innerHTML = dashboardShell(
    "supplier",
    "requests",
    `<div class="dash-top"><div><h1>Requests & evidence</h1><p>Respond to service enquiries, project-linked requests and certificate checks.</p></div><button class="btn outline" onclick="navigate('/supplier/suppliers')">Manage service catalog</button></div><div class="review-work-grid">${rows.map((r) => `<article class="panel review-work-card"><div class="project-card-head"><div><span class="eyebrow">${reviewEsc(r.kind || "Service request")}</span><h3>${reviewEsc(r.service)}</h3></div><span class="status ${r.status === "New" ? "submitted" : "active"}">${reviewEsc(r.status)}</span></div><p>${reviewEsc(r.customerCompany || r.customerName)} · ${reviewEsc(r.projectName || "General enquiry")}</p>${r.taskName ? `<div class="notice">Linked task: ${reviewEsc(r.phaseName)} · ${reviewEsc(r.taskName)}</div>` : ""}<p>${reviewEsc(r.message)}</p>${r.response ? `<div class="notice">Your response: ${reviewEsc(r.response)}</div>` : ""}<small>${date(r.createdAt)}</small>${["New", "Reviewing"].includes(r.status) ? `<div class="cc-actions"><button class="btn small outline" onclick="respondQuote('${r.id}','Reviewing')">Review</button><button class="btn small success" onclick="respondQuote('${r.id}','Quoted')">Send response / quote</button><button class="btn small danger" onclick="respondQuote('${r.id}','Declined')">Decline</button></div>` : ""}</article>`).join("") || '<div class="empty">No supplier requests yet.</div>'}</div>`,
  );
}
async function reviewNewChat() {
  const projects = await reviewProjects(),
    contacts = (await api("/contacts")).users || [];
  if (!projects.length) {
    toast("Create or join a project before starting a project chat", "error");
    return;
  }
  modal(
    "Start a project chat",
    `<form class="modal-form" id="reviewNewChatForm"><label>Project<select name="projectId" id="reviewChatProject" required>${projects.map((p) => `<option value="${reviewEsc(p.id)}">${reviewEsc(p.name)}</option>`).join("")}</select></label><label>Conversation scope<select name="context" id="reviewChatContext"><option value="project">Project-wide chat</option><option value="phase">Phase chat</option><option value="task">Task chat</option></select></label><label id="reviewPhaseScope" hidden>Phase<select name="phaseRef"><option value="">Choose phase</option>${projects.flatMap((p) => p.phases.map((ph) => `<option value="${p.id}|${ph.id}">${reviewEsc(p.name)} · ${reviewEsc(ph.name)}</option>`)).join("")}</select></label><label id="reviewTaskScope" hidden>Task<select name="taskRef"><option value="">Choose task</option>${projects.flatMap((p) => p.phases.flatMap((ph) => (ph.tasks || []).map((t) => `<option value="${p.id}|${ph.id}|${t.id}">${reviewEsc(p.name)} · ${reviewEsc(ph.name)} · ${reviewEsc(t.name)}</option>`))).join("")}</select></label><label>Chat name<input name="title" maxlength="120" placeholder="e.g. Installation coordination"></label><label>Add participants (choose one for a private chat or several for a group)<select name="participantIds" multiple size="6" required>${contacts.map((x) => `<option value="${reviewEsc(x.id)}">${reviewEsc(x.name)} — ${reviewEsc(x.company || x.role)}</option>`).join("")}</select></label><div id="reviewChatError" class="form-error" role="alert"></div><button class="btn primary">Create chat</button></form>`,
  );
  const context = document.getElementById("reviewChatContext");
  context.onchange = () => {
    document.getElementById("reviewPhaseScope").hidden = context.value !== "phase";
    document.getElementById("reviewTaskScope").hidden = context.value !== "task";
  };
  document.getElementById("reviewNewChatForm").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target),
      context = fd.get("context");
    let projectId = fd.get("projectId"),
      phaseId = "",
      taskId = "";
    if (context === "phase") {
      [projectId, phaseId] = String(fd.get("phaseRef") || "|").split("|");
    }
    if (context === "task") {
      [projectId, phaseId, taskId] = String(fd.get("taskRef") || "||").split("|");
    }
    const participantIds = [...e.target.elements.participantIds.selectedOptions].map((x) => x.value),
      title = fd.get("title");
    try {
      const { chat } = await api("/chats", {
        method: "POST",
        body: { projectId, phaseId, taskId, participantIds, title },
      });
      closeModal();
      navigate(`/${state.user.role}/messages?chat=${encodeURIComponent(chat.id)}`);
      messages(state.user.role);
    } catch (x) {
      document.getElementById("reviewChatError").textContent = x.message;
    }
  };
}
async function reviewChangeBadge(id, badge) {
  try {
    await api(`/admin/suppliers/${id}/badge`, { method: "PATCH", body: { badge } });
    toast(`Supplier badge set to ${badge}`);
  } catch (e) {
    toast(e.message, "error");
    route();
  }
}
const reviewBaseRoute = window.route;
window.route = async function () {
  const path = location.hash.replace(/^#/, "").split("?")[0],
    m = path.match(/^\/(customer|supplier)\/invoice\/([^/]+)$/);
  if (m) {
    if (!state.user) {
      navigate("/login");
      return;
    }
    if (state.user.role !== m[1]) {
      toast("This invoice view belongs to another account", "error");
      navigate(`/${state.user.role}/invoices`);
      return;
    }
    return invoiceDetailPage(decodeURIComponent(m[2]));
  }
  return reviewBaseRoute();
};
