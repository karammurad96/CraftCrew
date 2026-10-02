// Expanded collaboration workflows: phase/task planning, offers, document control and scoped workspaces.
const wfToday = () => new Date().toISOString().slice(0, 10);
const wfPath = () => location.hash.replace(/^#/, "");
const wfQuery = () => new URLSearchParams(location.hash.split("?")[1] || "");
function wfSupplier(sups, id) {
  return sups.find((s) => s.id === id);
}
async function wfCreateBid(pid, phid, tid) {
  const { project: p } = await api("/projects/" + pid),
    ph = p.phases.find((x) => x.id === phid),
    t = ph.tasks.find((x) => x.id === tid);
  modal(
    "Request comparable supplier bids",
    `<form id="wfF" class="modal-form"><p class="modal-intro">Suppliers submit amount, delivery days and scope. The task can be awarded to one supplier only.</p><label>Bid title<input name="title" value="${esc(t.name)}" required></label><label>Scope<textarea name="description" required>${esc(t.description || "")}</textarea></label><label>Response deadline<input name="dueDate" type="date" min="${wfToday()}" value="${t.dueDate || p.dueDate}" required></label><button class="btn primary">Publish bid request</button></form>`,
  );
  document.getElementById("wfF").onsubmit = async (e) => {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(e.target));
    Object.assign(b, { projectId: pid, phaseId: phid, taskId: tid });
    try {
      await api("/bids", { method: "POST", body: b });
      closeModal();
      navigate("/customer/offers?project=" + pid);
      await wfOffers();
    } catch (x) {
      toast(x.message, "error");
    }
  };
}
async function wfSupplierBid(pid, phid, tid) {
  const d = await api("/bids"),
    open = d.bids.filter((b) => b.projectId === pid && b.taskId === tid && b.status === "Open");
  const content = open.length
    ? open
        .map(
          (b) =>
            `<article class="cc-card"><span class="status active">Open until ${date(b.dueDate)}</span><h3>${esc(b.title)}</h3><p>${esc(b.description)}</p><form class="wf-offer-form" onsubmit="event.preventDefault();wfSubmitOffer('${b.id}',this)"><div class="two"><label>Total offer (€)<input name="amount" type="number" min="1" step="0.01" required></label><label>Delivery days<input name="deliveryDays" type="number" min="1" required></label></div><label>Included scope & assumptions<textarea name="notes"></textarea></label><button class="btn primary">Submit offer</button></form></article>`,
        )
        .join("")
    : '<div class="empty">There are no open bid requests for this task.</div>';
  modal("Submit supplier offer", content);
}
async function wfSubmitOffer(id, form) {
  const b = Object.fromEntries(new FormData(form));
  try {
    await api(`/bids/${id}/offers`, { method: "POST", body: b });
    closeModal();
    toast("Offer sent to customer");
    wfOffers();
  } catch (e) {
    toast(e.message, "error");
  }
}
async function wfOffers() {
  const d = await api("/bids"),
    projects = (await api("/projects")).projects;
  const q = wfQuery(),
    project = q.get("project") || "",
    status = q.get("status") || "All";
  let bids = d.bids;
  if (project) bids = bids.filter((x) => x.projectId === project);
  if (status !== "All") bids = bids.filter((x) => x.status === status);
  const content = `<div class="dash-top"><div><h1>${state.user.role === "customer" ? "Offers overview" : "Task bid opportunities"}</h1><p>Compare supplier price, delivery, scope and award one supplier per task.</p></div>${state.user.role === "customer" ? '<button class="btn primary" onclick="wfCreateBidFromPage()">+ Request bids for a task</button>' : ""}</div><div class="wf-filter-row"><label>Project<select id="wfBidProject" onchange="wfBidFilter()"><option value="">All projects</option>${projects.map((p) => `<option value="${p.id}" ${project === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label><label>Status<select id="wfBidStatus" onchange="wfBidFilter()">${["All", "Open", "Awarded", "Closed"].map((x) => `<option ${status === x ? "selected" : ""}>${x}</option>`).join("")}</select></label></div><div class="wf-bid-grid">${
    bids
      .map((b) => {
        const p = projects.find((x) => x.id === b.projectId),
          task = p?.phases.flatMap((ph) => ph.tasks || []).find((t) => t.id === b.taskId),
          offers = [...(b.offers || [])].sort((a, z) => a.amount - z.amount);
        return `<article class="panel wf-bid-card"><div class="project-card-head"><div><span class="eyebrow">${esc(p?.name || "Project")}</span><h3>${esc(b.title)}</h3></div><span class="status ${b.status === "Open" ? "submitted" : "active"}">${esc(b.status)}</span></div><p>${esc(b.description)}</p><div class="wf-task-meta"><span>Phase/task: ${esc(task?.name || "Task")}</span><span>Deadline ${date(b.dueDate)}</span><span>${offers.length} offers</span></div>${offers.length ? `<div class="wf-offer-table"><div class="wf-offer-head"><span>Supplier</span><span>Offer</span><span>Delivery</span><span>Decision</span></div>${offers.map((o, i) => `<div class="wf-offer-row"><b>${i === 0 ? "★ " : ""}${esc(o.supplierCompany)}</b><strong>${money(o.amount)}</strong><span>${o.deliveryDays} days</span><span>${esc(o.status)}</span><small>${esc(o.notes || "No scope note")}</small>${state.user.role === "customer" && b.status === "Open" && o.status === "Submitted" ? `<div class="cc-actions"><button class="btn small success" onclick="wfBidDecision('${b.id}','${o.id}','Accept offer')">Award this task</button><button class="btn small outline" onclick="wfBidDecision('${b.id}','${o.id}','Decline offer')">Decline</button></div>` : ""}</div>`).join("")}</div>` : '<div class="notice">Waiting for supplier offers.</div>'}${state.user.role === "customer" && b.status === "Open" ? `<button class="btn small outline" onclick="wfBidDecision('${b.id}','','Close bid')">Close bidding</button>` : ""}${b.status === "Awarded" ? '<div class="notice success-text">Task assigned to the selected supplier. Other offers were closed.</div>' : ""}</article>`;
      })
      .join("") || '<div class="empty">No bid requests match this filter.</div>'
  }</div>`;
  app.innerHTML = dashboardShell(
    state.user.role,
    state.user.role === "customer" ? "offers" : "bids",
    content,
  );
}
function wfBidFilter() {
  const p = document.getElementById("wfBidProject").value,
    s = document.getElementById("wfBidStatus").value;
  navigate(`/${state.user.role}/offers?project=${encodeURIComponent(p)}&status=${encodeURIComponent(s)}`);
  wfOffers();
}
async function wfBidDecision(id, offerId, action) {
  try {
    await api("/bids/" + id, { method: "PATCH", body: { offerId, action } });
    toast(action === "Accept offer" ? "Supplier selected and task assigned" : "Bid updated");
    wfOffers();
  } catch (e) {
    toast(e.message, "error");
  }
}
async function wfCreateBidFromPage() {
  const ps = (await api("/projects")).projects,
    opts = ps.flatMap((p) => p.phases.flatMap((ph) => (ph.tasks || []).map((t) => ({ p, ph, t }))));
  if (!opts.length) {
    toast("Add a project phase and task before requesting offers", "error");
    return;
  }
  const first = opts[0];
  await wfCreateBid(first.p.id, first.ph.id, first.t.id);
}
// Upload links download through the session (used by every page with a file link)
async function wfOpenDocument(url) {
  try {
    const r = await fetch(url, { credentials: "same-origin" });
    if (!r.ok) throw new Error("Could not open this document");
    const blob = await r.blob(),
      link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = url.split("/").pop();
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  } catch (e) {
    toast(e.message, "error");
  }
}
async function supplierBids() {
  await wfOffers();
}
async function customerInvoices() {
  const q = wfQuery(),
    filters = ["project", "phase", "task"],
    params = { projectId: q.get("project"), phaseId: q.get("phase"), taskId: q.get("task") },
    query = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
  const [d, pd] = await Promise.all([
      api("/invoices" + (query.toString() ? "?" + query : "")),
      api("/projects"),
    ]),
    projects = pd.projects,
    back = q.get("back") || "";
  const scoped = filters.some((k) => q.has(k));
  app.innerHTML = dashboardShell(
    "customer",
    "invoices",
    `<div class="dash-top"><div><h1>${scoped ? "Work item invoices" : "Invoices & payments"}</h1><p>${scoped ? "Invoices scoped to the selected project, phase or task." : "Review invoices across your projects."}</p></div><div class="cc-actions">${back ? `<button class="btn outline" onclick="navigate(decodeURIComponent('${encodeURIComponent(back)}'))">← Back to project</button>` : ""}${scoped ? '<button class="btn outline" onclick="navigate(\'/customer/invoices\')">All invoices</button>' : ""}</div></div>${scoped ? `<div class="notice">${esc(projects.find((x) => x.id === params.projectId)?.name || "Project")} · ${esc(params.phaseId || "All phases")} · ${esc(params.taskId || "All tasks")}</div>` : ""}<div class="panel"><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Invoice</th><th>Project / phase / task</th><th>Positions</th><th>Amount / cap</th><th>Status</th><th>Actions</th></tr></thead><tbody>${
      d.invoices
        .map((i) => {
          const p = projects.find((x) => x.id === i.projectId),
            ph = p?.phases.find((x) => x.id === i.phaseId),
            t = ph?.tasks?.find((x) => x.id === i.taskId);
          return `<tr><td><b>${esc(invNo(i))}</b><small>${date(i.createdAt)}</small></td><td>${esc(p?.name || i.projectId)}<small>${esc(ph?.name || i.phaseId)} · ${esc(i.taskName || t?.name || "Phase")}</small></td><td>${(i.lineItems || []).length || "—"}</td><td>${money(i.amount)}${i.orderedAmount ? `<small>of ${money(i.orderedAmount)}</small>` : ""}</td><td>${esc(i.status)}</td><td><button class="btn small outline" onclick="reviewInvoice('${i.id}')">${i.status === "Submitted" ? "Review" : "View"}</button><button class="btn small outline" onclick="wfInvoicePrint('${i.id}')">PDF</button><button class="btn small outline" onclick="wfInvoiceEmail('${i.id}')">Email</button></td></tr>`;
        })
        .join("") || '<tr><td colspan="6">No invoices match this work item.</td></tr>'
    }</tbody></table></div></div>`,
  );
}
async function supplierInvoices() {
  const q = wfQuery(),
    params = new URLSearchParams();
  for (const k of ["project", "phase", "task"]) if (q.get(k)) params.set(k + "Id", q.get(k));
  const d = await api("/invoices" + (params.size ? "?" + params : "")),
    back = q.get("back") || "";
  app.innerHTML = dashboardShell(
    "supplier",
    "invoices",
    `<div class="dash-top"><div><h1>Invoices</h1><p>Submit and track invoices for assigned work.</p></div><div class="cc-actions">${back ? `<button class="btn outline" onclick="navigate(decodeURIComponent('${encodeURIComponent(back)}'))">← Back to project</button>` : ""}<button class="btn primary" onclick="navigate('/supplier/invoices/new${location.hash.includes("?") ? "?" + location.hash.split("?")[1] : ""}')">+ Create invoice</button></div></div><div class="panel"><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Invoice</th><th>Order / task</th><th>Amount / cap</th><th>Status</th><th>Actions</th></tr></thead><tbody>${d.invoices.map((i) => `<tr><td>${esc(invNo(i))}<small>${date(i.createdAt)}</small></td><td>${esc(i.projectId)}<small>${esc(i.taskName || i.phaseId)}</small></td><td>${money(i.amount)}${i.orderedAmount ? `<small>of ${money(i.orderedAmount)}</small>` : ""}</td><td>${esc(i.status)}</td><td><button class="btn small outline" onclick="wfInvoicePrint('${i.id}')">PDF</button><button class="btn small outline" onclick="wfInvoiceEmail('${i.id}')">Email</button></td></tr>`).join("") || '<tr><td colspan="5">No invoices match.</td></tr>'}</tbody></table></div></div>`,
  );
}
// VAT modes offered on the invoice form, with the rule each one applies.
const WF_VAT_MODES = {
  standard: {
    rate: 19,
    label: "19 % VAT (standard rate)",
    help: "Standard rate: 19 % VAT is added to the net amount.",
  },
  reduced: {
    rate: 7,
    label: "7 % VAT (reduced rate)",
    help: "Reduced rate: 7 % VAT, only for goods and services that qualify for it.",
  },
  reverseCharge13b: {
    rate: 0,
    label: "Reverse charge (§13b UStG)",
    help: "Reverse charge (§13b UStG): no VAT on the invoice; the business customer pays the VAT. Common for construction and installation work between companies.",
  },
  smallBusiness19: {
    rate: 0,
    label: "Small business (§19 UStG)",
    help: "Small-business rule (§19 UStG): you charge no VAT because your turnover is below the limit.",
  },
  intraEU: {
    rate: 0,
    label: "Intra-EU service (reverse charge)",
    help: "Intra-EU service: no German VAT; the business customer in another EU country pays the VAT. Both VAT IDs must be on the invoice.",
  },
};
async function newInvoice() {
  const [d, profile] = await Promise.all([api("/projects"), api("/profile")]),
    supplier = profile.supplier,
    eligible = [];
  for (const p of d.projects)
    for (const ph of p.phases || []) {
      for (const t of ph.tasks || [])
        if (t.assignedSupplierId === supplier.id && t.acceptanceStatus === "Accepted")
          eligible.push({ p, ph, t });
      if (ph.supplierId === supplier.id && ph.acceptanceStatus === "Accepted")
        eligible.push({ p, ph, t: null });
    }
  if (!eligible.length) {
    await supplierInvoices();
    toast("Accept an assigned task before submitting an invoice", "error");
    return;
  }
  window.__ccInvoiceServices = supplier.services || [];
  window.__ccInvoiceEligible = eligible;
  const q = wfQuery();
  await supplierInvoices();
  const phaseOpts = eligible
    .map(
      ({ p, ph, t }) =>
        `<option value="${p.id}|${ph.id}|${t?.id || ""}">${esc(p.name)} — ${esc(ph.name)}${t ? " — " + esc(t.name) : ""}</option>`,
    )
    .join("");
  const cp = profile.companyProfile || {},
    today = new Date().toISOString().slice(0, 10),
    taxMissing = !["legalName", "address", "taxId"].every((k) => String(cp[k] || "").trim());
  modal(
    "Create invoice",
    `${taxMissing ? `<div class="notice warn">Add your legal company name, address and tax number or VAT ID to your company profile before creating an invoice. <a href="#/supplier/profile" onclick="closeModal()">Open company profile</a></div>` : ""}<p class="modal-intro">Link this invoice to its exact project task. The customer can compare the positions with the task order amount.</p><form id="invF" class="modal-form"><label>Accepted project task *<select name="target" id="invTarget" required><option value="">Choose assigned work</option>${phaseOpts}</select></label><div id="invoiceContext" class="notice">Select a task to see the customer and order cap.</div><div class="invoice-lines-head"><h3>Invoice positions</h3><button class="btn small outline" type="button" onclick="addInvoiceLine()">+ Add position</button></div><div id="invoiceLines"></div><div class="two"><label>VAT *<select name="vatMode" id="invVatMode">${Object.entries(
      WF_VAT_MODES,
    )
      .map(([k, m]) => `<option value="${k}">${m.label}</option>`)
      .join(
        "",
      )}</select></label><div class="two"><label>Service from *<input name="serviceDateFrom" type="date" value="${today}" required></label><label>Service to *<input name="serviceDateTo" type="date" value="${today}" required></label></div></div><p id="invVatHelp" class="subtle">${WF_VAT_MODES.standard.help}</p><div class="invoice-total-row sub"><span>Net amount</span><strong id="invoiceNet">€0</strong></div><div class="invoice-total-row sub"><span>Value added tax</span><strong id="invoiceVat">€0</strong></div><div class="invoice-total-row"><span>Invoice total (gross)</span><strong id="invoiceTotal">€0</strong></div><div id="invoiceOrderCheck" class="order-check">Select a work item.</div><label>Invoice note *<textarea name="description" required></textarea></label><label>Supporting attachment<input name="attachmentFile" type="file"></label><div id="invoiceError" class="form-error"></div><div class="action-row"><button class="btn primary">Submit invoice</button><button type="button" class="btn outline" onclick="closeModal();supplierInvoices()">Cancel</button></div></form>`,
  );
  const chosen = eligible.find(
    (x) => x.p.id === q.get("project") && x.ph.id === q.get("phase") && x.t?.id === (q.get("task") || ""),
  );
  if (chosen)
    document.getElementById("invTarget").value = `${chosen.p.id}|${chosen.ph.id}|${chosen.t?.id || ""}`;
  addInvoiceLine();
  const update = () => {
    const [pid, phid, tid] = document.getElementById("invTarget").value.split("|"),
      x = eligible.find((z) => z.p.id === pid && z.ph.id === phid && (z.t?.id || "") === tid),
      box = document.getElementById("invoiceContext");
    if (x) {
      const cap = Number(x.t?.orderAmount || x.ph.orderAmount) || 0;
      box.innerHTML = `Customer: <b>${esc(x.p.customer?.company || x.p.customer?.name || "Customer")}</b><br>${esc(x.p.name)} · ${esc(x.ph.name)}${x.t ? " · " + esc(x.t.name) : ""}<br>Order cap: ${cap ? money(cap) : "No cap set"}`;
    }
    refreshInvoiceTotal();
  };
  document.getElementById("invTarget").onchange = update;
  document.getElementById("invoiceLines").addEventListener("input", refreshInvoiceTotal);
  document.getElementById("invoiceLines").addEventListener("change", refreshInvoiceTotal);
  document.getElementById("invVatMode").onchange = () => {
    document.getElementById("invVatHelp").textContent =
      WF_VAT_MODES[document.getElementById("invVatMode").value].help;
    refreshInvoiceTotal();
  };
  update();
  document.getElementById("invF").onsubmit = async (e) => {
    e.preventDefault();
    const [projectId, phaseId, taskId] = document.getElementById("invTarget").value.split("|"),
      entry = eligible.find((x) => x.p.id === projectId && x.ph.id === phaseId && (x.t?.id || "") === taskId),
      lineItems = [...document.querySelectorAll(".invoice-line")].map((r) => ({
        service: r.querySelector("[name=service]").value,
        quantity: r.querySelector("[name=quantity]").value,
        unit: r.querySelector("[name=unit]").value,
        unitPrice: r.querySelector("[name=unitPrice]").value,
      }));
    if (!lineItems.length || lineItems.some((x) => !x.service || Number(x.quantity) <= 0)) {
      document.getElementById("invoiceError").textContent = "Add at least one complete invoice position.";
      return;
    }
    try {
      await api("/invoices", {
        method: "POST",
        body: {
          projectId,
          phaseId,
          taskId: taskId || undefined,
          description: new FormData(e.target).get("description"),
          lineItems,
          vatMode: new FormData(e.target).get("vatMode"),
          serviceDateFrom: new FormData(e.target).get("serviceDateFrom"),
          serviceDateTo: new FormData(e.target).get("serviceDateTo"),
        },
      });
      closeModal();
      toast("Invoice submitted to customer");
      navigate(`/supplier/invoices?project=${projectId}&phase=${phaseId}&task=${taskId}`);
      supplierInvoices();
    } catch (x) {
      document.getElementById("invoiceError").textContent = x.message;
    }
  };
}
async function wfInvoicePrint(id) {
  const { invoice: i } = await api("/invoices/" + id),
    p = (await api("/projects")).projects.find((x) => x.id === i.projectId),
    s = (await api("/suppliers/" + i.supplierId).catch(() => ({ supplier: { company: "Supplier" } })))
      .supplier;
  const html = `<html><head><title>Invoice ${esc(invNo(i))}</title><style>body{font:14px Arial;color:#142238;padding:40px}h1{color:#245fe8}table{border-collapse:collapse;width:100%;margin-top:25px}td,th{padding:10px;border-bottom:1px solid #ddd;text-align:left}.total{text-align:right;font-size:20px;margin-top:30px}</style></head><body><h1>CraftCrew · Invoice</h1><h2>${esc(invNo(i))}</h2><p>${esc(p?.name || i.projectId)} · ${esc(i.taskName || i.phaseId)}<br>Supplier: ${esc(s?.company || "Supplier")}<br>Date: ${date(i.createdAt)}</p><p>${esc(i.description || "")}</p><table><thead><tr><th>Service</th><th>Quantity</th><th>Rate</th><th>Total</th></tr></thead><tbody>${(i.lineItems || []).map((x) => `<tr><td>${esc(x.service)}</td><td>${x.quantity} ${esc(x.unit)}</td><td>${money(x.unitPrice || x.rate)}</td><td>${money(x.total)}</td></tr>`).join("")}</tbody></table><div class="total">Total: <b>${money(i.amount)}</b></div><p>Order amount: ${money(i.orderedAmount || 0)} · Status: ${esc(i.status)}</p><script>window.onload=()=>window.print()</script></body></html>`;
  const w = window.open("", "_blank");
  if (!w) {
    toast("Allow popups to print this invoice", "error");
    return;
  }
  w.document.write(html);
  w.document.close();
}
async function wfInvoiceEmail(id) {
  const { invoice: i } = await api("/invoices/" + id),
    p = (await api("/projects")).projects.find((x) => x.id === i.projectId),
    contacts = (await api("/contacts")).users || [],
    recipient =
      state.user.role === "supplier"
        ? contacts.find((x) => x.id === i.customerId)?.email
        : contacts.find((x) => x.supplierId === i.supplierId)?.email,
    subject = encodeURIComponent(`CraftCrew invoice ${invNo(i)} — ${p?.name || ""}`),
    body = encodeURIComponent(
      `Please find invoice ${invNo(i)} for ${p?.name || i.projectId} (${i.taskName || i.phaseId}), amount ${money(i.amount)}.\n\nUse the PDF button to print/save the invoice as PDF and attach it to this email.`,
    );
  location.href = `mailto:${recipient || ""}?subject=${subject}&body=${body}`;
}
function refreshInvoiceTotal() {
  const rows = [...document.querySelectorAll(".invoice-line")],
    total = rows.reduce(
      (sum, row) =>
        sum +
        (Number(row.querySelector("[name=quantity]")?.value) || 0) *
          (Number(row.querySelector("[name=unitPrice]")?.value) || 0),
      0,
    ),
    totalEl = document.getElementById("invoiceTotal"),
    rate = WF_VAT_MODES[document.getElementById("invVatMode")?.value]?.rate || 0,
    vat = Math.round(total * rate) / 100;
  if (document.getElementById("invoiceNet")) {
    document.getElementById("invoiceNet").textContent = money(total);
    document.getElementById("invoiceVat").textContent = `${money(vat)} (${rate} %)`;
  }
  if (totalEl) totalEl.textContent = money(total + vat);
  const [pid, phid, tid] = (document.getElementById("invTarget")?.value || "||").split("|"),
    entry = (window.__ccInvoiceEligible || []).find(
      (x) => x.p.id === pid && x.ph.id === phid && (x.t?.id || "") === tid,
    ),
    cap = Number(entry?.t?.orderAmount || entry?.ph?.orderAmount) || 0,
    check = document.getElementById("invoiceOrderCheck");
  if (!check) return;
  if (!entry || !cap) {
    check.textContent = entry
      ? "No order amount is set for this work item."
      : "Choose an order to compare this invoice.";
    check.className = "order-check";
    return;
  }
  const delta = total - cap;
  check.textContent =
    delta > 0
      ? `Exceeds order by ${money(delta)}. The customer will see this before approval.`
      : `Within the approved order (${money(cap)}); ${money(cap - total)} remaining.`;
  check.className = "order-check " + (delta > 0 ? "over" : "within");
}
async function messages(role) {
  const q = wfQuery(),
    projects = (await api("/projects")).projects,
    contacts = (await api("/contacts")).users || [],
    projectId = q.get("project") || "",
    phaseId = q.get("phase") || "",
    taskId = q.get("task") || "",
    back = q.get("back") || "",
    project = projects.find((x) => x.id === projectId);
  let items = [];
  if (project) {
    const full = await api("/projects/" + project.id);
    for (const ph of full.project.phases)
      for (const t of ph.tasks || [])
        if (!phaseId || phaseId === ph.id)
          if (!taskId || taskId === t.id) {
            const sid = t.assignedSupplierId;
            if (sid && state.user.role === "customer")
              contacts.filter((u) => u.supplierId === sid).forEach((u) => items.push({ ph, t, u }));
            else if (sid && state.user.supplierId === sid) {
              const u = contacts.find((x) => x.id === project.customerId);
              if (u) items.push({ ph, t, u });
            }
          }
  }
  const selected = items[0],
    params = new URLSearchParams();
  if (projectId) params.set("projectId", projectId);
  if (phaseId) params.set("phaseId", phaseId);
  if (taskId) params.set("taskId", taskId);
  const d = await api("/messages" + (params.size ? "?" + params : "")),
    messagesBy = new Map();
  for (const m of d.messages) {
    const k = [m.projectId || "", m.phaseId || "", m.taskId || "", m.senderId, m.recipientId].join("|");
    if (!messagesBy.has(k)) messagesBy.set(k, []);
    messagesBy.get(k).push(m);
  }
  const content = `<div class="dash-top"><div><h1>Project messages</h1><p>Private conversations are visible only to the selected project and task participants.</p></div><div class="cc-actions">${back ? `<button class="btn outline" onclick="navigate(decodeURIComponent('${encodeURIComponent(back)}'))">← Back to project</button>` : ""}<button class="btn primary" onclick="wfNewMessage('${projectId}','${phaseId}','${taskId}')" ${selected ? "" : "disabled"}>+ New message</button></div></div>${project ? `<div class="notice">${esc(project.name)}${selected ? " · " + esc(selected.ph.name) + " · " + esc(selected.t.name) : ""}</div>` : `<div class="wf-filter-row"><label>Project<select id="wfMsgProject" onchange="wfMsgSelect()"><option value="">Choose project</option>${projects.map((x) => `<option value="${x.id}" ${x.id === projectId ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label><label>Phase<select id="wfMsgPhase" onchange="wfMsgSelect()"><option value="">All phases</option>${project?.phases.map((x) => `<option value="${x.id}" ${x.id === phaseId ? "selected" : ""}>${esc(x.name)}</option>`).join("") || ""}</select></label><label>Task<select id="wfMsgTask" onchange="wfMsgSelect()"><option value="">All tasks</option>${project?.phases.flatMap((ph) => (ph.tasks || []).map((t) => `<option value="${t.id}" ${t.id === taskId ? "selected" : ""}>${esc(ph.name)} · ${esc(t.name)}</option>`)).join("") || ""}</select></label></div>`}<div class="wf-message-groups">${[...messagesBy.entries()].map(([k, arr]) => `<section class="panel"><div class="panel-title"><b>${esc(projects.find((x) => x.id === arr[0].projectId)?.name || project?.name || "Project")} · ${esc(arr[0].taskId || "Project discussion")}</b><span>${arr.length} messages <a class="btn small outline" href="#/${role}/projects/${encodeURIComponent(arr[0].projectId || project?.id || "")}">Open project</a></span></div>${arr.map((m) => `<article class="wf-message ${m.senderId === state.user.id ? "mine" : ""}"><b>${m.senderId === state.user.id ? "You" : esc(contacts.find((u) => u.id === m.senderId)?.name || "Project participant")}</b><p>${esc(m.text)}</p><small>${date(m.createdAt)}</small></article>`).join("")}</section>`).join("") || '<div class="empty">Select a project and task to view its private conversation.</div>'}</div>`;
  app.innerHTML = dashboardShell(role, "messages", content);
}
function wfMsgSelect() {
  const p = document.getElementById("wfMsgProject").value,
    ph = document.getElementById("wfMsgPhase").value,
    t = document.getElementById("wfMsgTask").value;
  navigate(`/${state.user.role}/messages?project=${p}&phase=${ph}&task=${t}`);
  messages(state.user.role);
}
async function wfNewMessage(pid, phid, tid) {
  if (!pid || !phid || !tid) {
    toast("Choose a task first", "error");
    return;
  }
  const p = (await api("/projects/" + pid)).project,
    ph = p.phases.find((x) => x.id === phid),
    t = ph?.tasks?.find((x) => x.id === tid);
  if (!t?.assignedSupplierId) {
    toast("This task has no assigned supplier", "error");
    return;
  }
  const contacts = (await api("/contacts")).users || [],
    recipients =
      state.user.role === "customer"
        ? contacts.filter((x) => x.supplierId === t.assignedSupplierId)
        : contacts.filter(
            (x) =>
              x.role === "customer" && (x.id === p.customerId || (p.participantIds || []).includes(x.id)),
          );
  if (!recipients.length) {
    toast("No project contact available", "error");
    return;
  }
  modal(
    "Message task participants",
    `<form id="wfF" class="modal-form"><div class="notice">${esc(p.name)} · ${esc(ph.name)} · ${esc(t.name)}</div><label>Send privately to<select name="recipientId" required>${recipients.map((x) => `<option value="${x.id}">${esc(x.name)} — ${esc(x.company || x.role)}</option>`).join("")}</select></label><label>Message<textarea name="text" maxlength="5000" required></textarea></label><button class="btn primary">Send privately</button></form>`,
  );
  document.getElementById("wfF").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api("/messages", {
        method: "POST",
        body: { ...Object.fromEntries(new FormData(e.target)), projectId: pid, phaseId: phid, taskId: tid },
      });
      closeModal();
      messages(state.user.role);
    } catch (x) {
      toast(x.message, "error");
    }
  };
}
async function profilePage(role) {
  const d = await api("/profile"),
    s = d.supplier || {},
    c = d.companyProfile || {};
  state.user = { ...state.user, ...d.user };
  localStorage.setItem("cc_user", JSON.stringify(state.user));
  app.innerHTML = dashboardShell(
    role,
    "profile",
    `<div class="dash-top"><div><div class="eyebrow">ACCOUNT WORKSPACE</div><h1>Company profile & settings</h1><p>Share the business identity and contacts project partners need.</p></div><button class="btn primary" onclick="wfEditCompanyProfile()">Edit company details</button></div><div class="wf-profile-head">${d.user.profileImage ? `<img class="wf-profile-image" src="${esc(d.user.profileImage)}" alt="Company profile">` : `<div class="supplier-avatar large">${esc((d.user.company || d.user.name).slice(0, 2).toUpperCase())}</div>`}<div><h2>${esc(d.user.company || "Company name required")}</h2><b>${esc(d.user.name)}</b><p>${esc(d.user.email)} · ${esc(c.phone || "Add phone")}</p></div></div><div class="wf-profile-grid">${[
      ["Legal name", c.legalName],
      ["VAT / tax ID", c.taxId],
      ["Industry", c.industry],
      ["Company size", c.companySize],
      ["Address", c.address],
      ["Website", c.website],
      ["Main contact", c.contactName || d.user.name],
      ["Phone", c.phone],
      ["Procurement email", c.procurementEmail],
      ["About", c.description],
    ]
      .map(
        ([k, v]) =>
          `<article class="cc-card"><span class="cc-label">${k}</span><b>${esc(v || "Add company information")}</b></article>`,
      )
      .join(
        "",
      )}</div>${s ? `<div class="panel" style="margin-top:16px"><h3>Supplier marketplace profile</h3><p>${esc(supplierBadge(s))} · ${Number(s.employees) || 0} staff · ${Number(s.experience) || 0} years</p><button class="btn outline" onclick="navigate('/supplier/suppliers')">Manage service catalog and team</button></div>` : ""}`,
  );
}
async function wfReadImage(file) {
  if (file.size > 1200000) throw new Error("Choose a profile image smaller than 1.2 MB");
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file");
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
async function wfEditCompanyProfile() {
  const d = await api("/profile"),
    c = d.companyProfile || {};
  modal(
    "Edit company profile",
    `<form id="wfProfile" class="modal-form"><label>Company profile photo<input name="profileFile" type="file" accept="image/*"></label><div class="two"><label>Legal company name<input name="legalName" value="${esc(c.legalName || "")}"></label><label>Public company name<input name="company" value="${esc(d.user.company || "")}" required></label></div><div class="two"><label>VAT / tax ID<input name="taxId" value="${esc(c.taxId || "")}"></label><label>Industry<input name="industry" value="${esc(c.industry || "")}"></label></div><div class="two"><label>Company size<select name="companySize">${["", "1–10", "11–50", "51–250", "251–1000", "1000+"].map((x) => `<option ${x === c.companySize ? "selected" : ""}>${x}</option>`).join("")}</select></label><label>Phone<input name="phone" value="${esc(c.phone || "")}"></label></div><label>Registered / business address<textarea name="address">${esc(c.address || "")}</textarea></label><div class="two"><label>Website<input name="website" type="url" value="${esc(c.website || "")}"></label><label>Procurement email<input name="procurementEmail" type="email" value="${esc(c.procurementEmail || "")}"></label></div><label>Main contact<input name="contactName" value="${esc(c.contactName || d.user.name)}"></label><label>Company overview<textarea name="description">${esc(c.description || "")}</textarea></label><button class="btn primary">Save company profile</button></form>`,
  );
  document.getElementById("wfProfile").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target),
      file = fd.get("profileFile");
    let profileImage = d.user.profileImage || "";
    try {
      if (file?.size) profileImage = await wfReadImage(file);
      const companyProfile = Object.fromEntries([...fd.entries()].filter(([k]) => k !== "profileFile"));
      await api("/profile", {
        method: "PUT",
        body: { company: companyProfile.company, profileImage, companyProfile },
      });
      closeModal();
      profilePage(state.user.role);
    } catch (x) {
      toast(x.message, "error");
    }
  };
}
async function supplierCatalog() {
  const d = await api("/profile"),
    s = d.supplier || {},
    items = s.serviceCatalog || [];
  app.innerHTML = dashboardShell(
    "supplier",
    "suppliers",
    `<div class="dash-top"><div><div class="eyebrow">YOUR MARKETPLACE PROFILE</div><h1>Service catalog</h1><p>Manage individually priced services and the people qualified to deliver them.</p></div><div class="cc-actions"><button class="btn outline" onclick="editProfile()">Edit company details</button><button class="btn primary" onclick="wfEditCatalog()">Edit catalog & team</button></div></div><div class="notice">Customers can see your published services and send requests linked to a project task.</div><div class="wf-stat-grid"><div class="cc-card"><span class="cc-label">Employees</span><b>${Number(s.employees) || 0}</b></div><div class="cc-card"><span class="cc-label">Key people</span><b>${(s.teamMembers || []).length}</b></div><div class="cc-card"><span class="cc-label">Experience</span><b>${Number(s.experience) || 0}+ years</b></div></div><section class="panel"><div class="panel-title"><h3>Published services</h3><button class="btn small primary" onclick="wfEditCatalog()">+ Add service / person</button></div><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Service / role</th><th>Description / qualifications</th><th>Rate</th><th>Capacity / lead time</th><th>Status</th></tr></thead><tbody>${items.map((x) => `<tr><td><b>${esc(x.name)}</b><small>${esc(x.category || "Service")}</small></td><td>${esc(x.description || "")}<small>${esc(x.qualifications || "")}</small></td><td>${money(x.rate || 0)} / ${esc(x.unit || "hour")}</td><td>${esc(x.capacity || "By agreement")}<small>${esc(x.leadTime || "Schedule on request")}</small></td><td>${esc(x.status || "Published")}</td></tr>`).join("") || '<tr><td colspan="5">Add catalog rows for each service or employee position.</td></tr>'}</tbody></table></div></section><section class="panel"><div class="panel-title"><h3>Key employees & specialist roles</h3><span>${(s.teamMembers || []).length} listed</span></div><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Name</th><th>Role</th><th>Experience</th><th>Certifications</th><th>Availability</th></tr></thead><tbody>${(s.teamMembers || []).map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(x.role)}</td><td>${esc(x.experience || "")}</td><td>${esc(x.certifications || "")}</td><td>${esc(x.availability || "Available")}</td></tr>`).join("") || '<tr><td colspan="5">No team profiles yet.</td></tr>'}</tbody></table></div></section>`,
  );
}
async function wfEditCatalog() {
  const d = await api("/profile"),
    s = d.supplier || {},
    catalog = s.serviceCatalog || [],
    team = s.teamMembers || [];
  modal(
    "Edit services and team",
    `<form id="wfCatalog" class="modal-form"><h3>Service rows</h3><div id="wfServiceRows">${catalog.map((x) => wfServiceRow(x)).join("")}</div><button type="button" class="btn small outline" onclick="wfAddServiceRow()">+ Add service position</button><h3>Employee / specialist rows</h3><div id="wfTeamRows">${team.map((x) => wfTeamRow(x)).join("")}</div><button type="button" class="btn small outline" onclick="wfAddTeamRow()">+ Add person</button><div class="two"><label>Total employees<input name="employees" type="number" min="0" value="${Number(s.employees) || team.length}"></label><label>Years in business<input name="experience" type="number" min="0" value="${Number(s.experience) || 0}"></label></div><div class="two"><label>Availability<select name="availability">${["Available", "Busy", "Unavailable"].map((x) => `<option ${x === s.availability ? "selected" : ""}>${x}</option>`).join("")}</select></label><label>Certifications<input name="certifications" value="${esc((s.certifications || []).join(", "))}"></label></div><div id="wfCatalogError" class="form-error"></div><button class="btn primary">Save catalog</button></form>`,
  );
  if (!catalog.length) wfAddServiceRow();
  if (!team.length) wfAddTeamRow();
  document.getElementById("wfCatalog").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target),
      readRows = (selector) =>
        [...document.querySelectorAll(selector)]
          .map((row) =>
            Object.fromEntries([...row.querySelectorAll("[name]")].map((el) => [el.name, el.value])),
          )
          .filter((x) => x.name),
      serviceCatalog = readRows(".wf-service-row"),
      teamMembers = readRows(".wf-person-row"),
      services = [...new Set([...serviceCatalog.map((x) => x.name), ...(s.services || [])])];
    try {
      await api("/profile", {
        method: "PUT",
        body: {
          serviceCatalog,
          teamMembers,
          services,
          employees: fd.get("employees"),
          experience: fd.get("experience"),
          availability: fd.get("availability"),
          certifications: String(fd.get("certifications") || "")
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
        },
      });
      closeModal();
      supplierCatalog();
    } catch (x) {
      document.getElementById("wfCatalogError").textContent = x.message;
    }
  };
}
function wfServiceRow(x = {}) {
  return `<fieldset class="wf-service-row"><legend>Service / position</legend><button type="button" class="btn small danger wf-remove" onclick="this.closest('fieldset').remove()">Remove</button><div class="two"><label>Name<input name="name" value="${esc(x.name || "")}" required></label><label>Category<input name="category" value="${esc(x.category || "Service")}"></label></div><label>Description<input name="description" value="${esc(x.description || "")}"></label><div class="three"><label>Rate (€)<input name="rate" type="number" min="0" step="0.01" value="${Number(x.rate) || 0}"></label><label>Unit<select name="unit">${["hour", "day", "project", "unit", "fixed"].map((u) => `<option value="${u}" ${u === (x.unit || "hour") ? "selected" : ""}>${u}</option>`).join("")}</select></label><label>Capacity<input name="capacity" value="${esc(x.capacity || "")}" placeholder="3 crews"></label></div><div class="two"><label>Lead time<input name="leadTime" value="${esc(x.leadTime || "")}"></label><label>Qualifications<input name="qualifications" value="${esc(x.qualifications || "")}"></label></div></fieldset>`;
}
function wfTeamRow(x = {}) {
  return `<fieldset class="wf-person-row"><legend>Employee / specialist</legend><button type="button" class="btn small danger wf-remove" onclick="this.closest('fieldset').remove()">Remove</button><div class="three"><label>Name<input name="name" value="${esc(x.name || "")}" required></label><label>Role<input name="role" value="${esc(x.role || "")}"></label><label>Experience<input name="experience" value="${esc(x.experience || "")}"></label></div><div class="two"><label>Certifications<input name="certifications" value="${esc(x.certifications || "")}"></label><label>Availability<input name="availability" value="${esc(x.availability || "Available")}"></label></div></fieldset>`;
}
function wfAddServiceRow() {
  document.getElementById("wfServiceRows")?.insertAdjacentHTML("beforeend", wfServiceRow());
}
function wfAddTeamRow() {
  document.getElementById("wfTeamRows")?.insertAdjacentHTML("beforeend", wfTeamRow());
}
const wfOldRoute = async () => {
  const h = (location.hash.replace(/^#/, "") || "/").split("?")[0] || "/",
    parts = h.split("?")[0].split("/").filter(Boolean);
  // Public supplier profile, shareable as a link (T61).
  if (parts[0] === "customer") {
    if (parts[1] === "profile") return profilePage("customer");
  }
  if (parts[0] === "supplier") {
    if (parts[1] === "profile") return profilePage("supplier");
  }
  if (parts[0] === "admin") {
    if (parts[1] === "applications") return adminApplications();
    if (parts[1] === "profile-changes") return adminProfileChanges();
    if (parts[1] === "users") return adminUsers();
    if (parts[1] === "billing") return adminBilling();
    if (parts[1] === "reports") return adminReports();
    if (parts[1] === "disputes") return adminDisputes();
    if (parts[1] === "profile") return profilePage("admin");
  }
  // A bare workspace link opens the dashboard; anything else unknown is a proper 404, not the home page.
  if (state.user && parts[0] === state.user.role && !parts[1])
    return navigate(`/${state.user.role}/dashboard`);
  return renderNotFound();
};
async function route() {
  topActions();
  const full = location.hash.replace(/^#/, "") || "/",
    h = full.split("?")[0],
    parts = h.split("/").filter(Boolean);
  if (!state.user && /^\/(customer|supplier|admin)(\/|$)/.test(h)) {
    navigate("/login");
    return;
  }
  try {
    if (parts[0] === "customer") {
      if (parts[1] === "offers") return wfOffers();
      if (parts[1] === "invoices") return customerInvoices();
      if (parts[1] === "messages") return messages("customer");
      if (parts[1] === "profile") return profilePage("customer");
    }
    if (parts[0] === "supplier") {
      if (parts[1] === "bids" || parts[1] === "offers") return supplierBids();
      if (parts[1] === "invoices" && parts[2] === "new") return newInvoice();
      if (parts[1] === "invoices") return supplierInvoices();
      if (parts[1] === "messages") return messages("supplier");
      if (parts[1] === "profile") return profilePage("supplier");
      if (parts[1] === "suppliers") return supplierCatalog();
    }
    return await wfOldRoute();
  } catch (e) {
    console.error(e);
    toast(e.message, "error");
    const active = parts[1] || "dashboard";
    app.innerHTML = dashboardShell(
      state.user?.role || "customer",
      active,
      `<div class="empty"><h2>We could not open this page</h2><p>${esc(e.message)}</p><button class="btn primary" onclick="route()">Try again</button></div>`,
    );
  }
}
document.addEventListener("click", (event) => {
  const link = event.target.closest('a[href^="/uploads/"]');
  if (link) {
    event.preventDefault();
    wfOpenDocument(link.getAttribute("href"));
  }
});
window.addEventListener("hashchange", () => {
  if (typeof route === "function") route();
});
