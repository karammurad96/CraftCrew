/* Platform additions from the sitemap review: role-aware settings (security, notifications,
   payouts), admin analytics and audit log, project activity,
   project templates and the completion review flow. Loaded after all other layers. */
const paEsc = (value) => esc(value ?? "");
const paToday = () => new Date().toISOString().slice(0, 10);
const paDaysFrom = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const paStatusClass = (s) =>
  String(s || "")
    .toLowerCase()
    .replaceAll(" ", "-");
const paTime = (d) =>
  d
    ? new Date(d).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

/* Work items (phases with a direct supplier and tasks) flattened for deadline checks. */
function paWorkItems(projects, supplierId) {
  const items = [];
  for (const p of projects)
    for (const ph of p.phases || []) {
      const tasks = ph.tasks || [];
      if (!tasks.length && (!supplierId || ph.supplierId === supplierId))
        items.push({
          p,
          ph,
          name: ph.name,
          dueDate: ph.dueDate,
          status: ph.status,
          link: `/${state.user.role}/projects/${p.id}/phases/${ph.id}`,
        });
      for (const t of tasks)
        if (!supplierId || (t.assignedSupplierId === supplierId && t.acceptanceStatus === "Accepted"))
          items.push({
            p,
            ph,
            t,
            name: t.name,
            dueDate: t.dueDate,
            status: t.status,
            link: `/${state.user.role}/projects/${p.id}/tasks/${t.id}`,
          });
    }
  return items.filter((x) => x.p.status !== "Completed");
}
function paMonths(n) {
  const out = [],
    d = new Date();
  d.setDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/* ---------- Admin reports & analytics ---------- */
const paBaseAdminReports = adminReports;
adminReports = async function () {
  await paBaseAdminReports();
  const [{ projects = [] }, { invoices = [] }, { users = [] }, { suppliers = [] }] = await Promise.all([
    api("/projects"),
    api("/invoices"),
    api("/admin/users"),
    api("/admin/suppliers"),
  ]);
  const items = paWorkItems(projects).concat(
    projects
      .filter((p) => p.status === "Completed")
      .flatMap((p) =>
        (p.phases || []).flatMap((ph) =>
          (ph.tasks || []).map((t) => ({ p, ph, t, status: t.status, dueDate: t.dueDate })),
        ),
      ),
  );
  const today = paToday(),
    completed = items.filter((x) => x.status === "Completed").length,
    overdue = items.filter((x) => x.status !== "Completed" && x.dueDate && x.dueDate < today).length;
  const onTime = completed + overdue ? Math.round((completed / (completed + overdue)) * 100) : 100;
  const statusCounts = ["In Progress", "On Hold", "Completed"].map((s) => [
    s,
    projects.filter((p) => p.status === s).length,
  ]);
  const sum = (list) => list.reduce((a, i) => a + Number(i.amount || 0), 0);
  const supplierRows = suppliers
    .filter((s) => s.live)
    .map((s) => {
      const mine = items.filter(
          (x) => x.t?.assignedSupplierId === s.id || (!x.t && x.ph.supplierId === s.id),
        ),
        inv = invoices.filter((i) => i.supplierId === s.id);
      return {
        s,
        assigned: mine.length,
        done: mine.filter((x) => x.status === "Completed").length,
        late: mine.filter((x) => x.status !== "Completed" && x.dueDate < today).length,
        invoiced: sum(inv),
        approved: sum(inv.filter((i) => ["Approved", "Paid"].includes(i.status))),
      };
    })
    .filter((r) => r.assigned || r.invoiced)
    .sort((a, b) => b.invoiced - a.invoiced)
    .slice(0, 12);
  const customerRows = users
    .filter((u) => u.role === "customer")
    .map((u) => {
      const ps = projects.filter((p) => p.customerId === u.id),
        inv = invoices.filter((i) => i.customerId === u.id);
      return {
        u,
        projects: ps.length,
        active: ps.filter((p) => p.status === "In Progress").length,
        budget: ps.reduce((a, p) => a + Number(p.budget || 0), 0),
        invoiced: sum(inv),
        approved: sum(inv.filter((i) => ["Approved", "Paid"].includes(i.status))),
      };
    })
    .filter((r) => r.projects)
    .sort((a, b) => b.budget - a.budget);
  const months = paMonths(6).map((m) => {
    const inMonth = invoices.filter((i) => String(i.createdAt).slice(0, 7) === m);
    return {
      m,
      invoiced: sum(inMonth),
      approved: sum(inMonth.filter((i) => ["Approved", "Paid"].includes(i.status))),
      paid: sum(inMonth.filter((i) => i.status === "Paid")),
      count: inMonth.length,
    };
  });
  window.paReportData = { supplierRows, customerRows, months };
  const html = `<section class="pa-reports">
    <div class="cc-grid4 pa-kpis">
      <div class="cc-card"><span class="cc-label">On-time delivery</span><div class="cc-kpi">${onTime}%</div><small>${completed} completed · ${overdue} overdue work items</small></div>
      <div class="cc-card"><span class="cc-label">Total project budget</span><div class="cc-kpi">${money(projects.reduce((a, p) => a + Number(p.budget || 0), 0))}</div><small>${statusCounts.map(([s, n]) => `${n} ${s.toLowerCase()}`).join(" · ")}</small></div>
      <div class="cc-card"><span class="cc-label">Approved invoice value</span><div class="cc-kpi">${money(sum(invoices.filter((i) => ["Approved", "Paid"].includes(i.status))))}</div><small>${money(sum(invoices.filter((i) => i.status === "Paid")))} paid</small></div>
      <div class="cc-card"><span class="cc-label">Invoice approval rate</span><div class="cc-kpi">${invoices.length ? Math.round((invoices.filter((i) => ["Approved", "Paid"].includes(i.status)).length / invoices.length) * 100) : 0}%</div><small>${invoices.filter((i) => ["Rejected", "Changes Requested"].includes(i.status)).length} rejected or returned</small></div>
    </div>
    <section class="panel"><div class="panel-title"><h3>Financial report · last 6 months</h3><button class="btn small outline" onclick="paExportReport('months')">Export CSV</button></div><div class="cc-table-wrap"><table class="cc-table pa-table"><thead><tr><th>Month</th><th>Invoices</th><th>Invoiced</th><th>Approved</th><th>Paid</th></tr></thead><tbody>${months.map((x) => `<tr><td>${new Date(x.m + "-01").toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</td><td>${x.count}</td><td>${money(x.invoiced)}</td><td>${money(x.approved)}</td><td>${money(x.paid)}</td></tr>`).join("")}</tbody></table></div></section>
    <section class="panel"><div class="panel-title"><h3>Supplier performance</h3><button class="btn small outline" onclick="paExportReport('suppliers')">Export CSV</button></div><div class="cc-table-wrap"><table class="cc-table pa-table"><thead><tr><th>Supplier</th><th>Badge</th><th>Rating</th><th>Work items</th><th>Completed</th><th>Overdue</th><th>Invoiced</th><th>Approved</th></tr></thead><tbody>${supplierRows.map((r) => `<tr><td><b>${paEsc(r.s.company)}</b></td><td>${paEsc(supplierBadge(r.s))}</td><td>★ ${Number(r.s.rating || 0).toFixed(1)}</td><td>${r.assigned}</td><td>${r.done}</td><td class="${r.late ? "danger-text" : ""}">${r.late}</td><td>${money(r.invoiced)}</td><td>${money(r.approved)}</td></tr>`).join("") || '<tr><td colspan="8">No supplier activity yet.</td></tr>'}</tbody></table></div></section>
    <section class="panel"><div class="panel-title"><h3>Customer analytics</h3><button class="btn small outline" onclick="paExportReport('customers')">Export CSV</button></div><div class="cc-table-wrap"><table class="cc-table pa-table"><thead><tr><th>Customer</th><th>Projects</th><th>Active</th><th>Budget</th><th>Invoiced</th><th>Approved</th></tr></thead><tbody>${customerRows.map((r) => `<tr><td><b>${paEsc(r.u.company || r.u.name)}</b><small>${paEsc(r.u.email)}</small></td><td>${r.projects}</td><td>${r.active}</td><td>${money(r.budget)}</td><td>${money(r.invoiced)}</td><td>${money(r.approved)}</td></tr>`).join("") || '<tr><td colspan="6">No customer projects yet.</td></tr>'}</tbody></table></div></section>
  </section>`;
  const top = document.querySelector(".dashboard-content .dash-top");
  top?.querySelector("p") &&
    (top.querySelector("p").textContent =
      "Project, supplier, customer and financial performance across the marketplace.");
  document.querySelector(".dashboard-content .cc-grid4")?.insertAdjacentHTML("afterend", html);
};
function paExportReport(kind) {
  const d = window.paReportData || {},
    quote = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const rows =
    kind === "months"
      ? [
          ["Month", "Invoices", "Invoiced", "Approved", "Paid"],
          ...(d.months || []).map((x) => [x.m, x.count, x.invoiced, x.approved, x.paid]),
        ]
      : kind === "suppliers"
        ? [
            ["Supplier", "Badge", "Rating", "Work items", "Completed", "Overdue", "Invoiced", "Approved"],
            ...(d.supplierRows || []).map((r) => [
              r.s.company,
              r.s.badge,
              r.s.rating,
              r.assigned,
              r.done,
              r.late,
              r.invoiced,
              r.approved,
            ]),
          ]
        : [
            ["Customer", "Email", "Projects", "Active", "Budget", "Invoiced", "Approved"],
            ...(d.customerRows || []).map((r) => [
              r.u.company || r.u.name,
              r.u.email,
              r.projects,
              r.active,
              r.budget,
              r.invoiced,
              r.approved,
            ]),
          ];
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob(["﻿" + rows.map((r) => r.map(quote).join(";")).join("\r\n")], {
      type: "text/csv;charset=utf-8",
    }),
  );
  a.download = `craftcrew-${kind}-report.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* ---------- Audit log (admin) ---------- */
async function paAuditPage() {
  const q = new URLSearchParams(location.hash.split("?")[1] || ""),
    params = new URLSearchParams();
  for (const k of ["q", "role", "projectId"]) if (q.get(k)) params.set(k, q.get(k));
  const [{ entries = [], total = 0 }, { projects = [] }] = await Promise.all([
    api("/audit?" + params),
    api("/projects"),
  ]);
  app.innerHTML = dashboardShell(
    "admin",
    "audit",
    `<div class="dash-top"><div><div class="eyebrow">COMPLIANCE</div><h1>Audit log</h1><p>Every change made through CraftCrew is recorded with who did it, when, and on which project.</p></div></div>
    <form class="panel pa-filters" id="paAuditFilters"><label>Search<input name="q" value="${paEsc(q.get("q") || "")}" placeholder="Action, person or record"></label><label>Role<select name="role"><option value="">All roles</option>${["customer", "supplier", "admin", "public"].map((r) => `<option ${q.get("role") === r ? "selected" : ""} value="${r}">${r[0].toUpperCase() + r.slice(1)}</option>`).join("")}</select></label><label>Project<select name="projectId"><option value="">All projects</option>${projects.map((p) => `<option value="${p.id}" ${q.get("projectId") === p.id ? "selected" : ""}>${paEsc(p.name)}</option>`).join("")}</select></label><div class="pa-filter-actions"><button class="btn primary">Apply</button><button type="button" class="btn outline" onclick="navigate('/admin/audit')">Reset</button></div></form>
    <section class="panel"><div class="panel-title"><h3>${total} recorded action(s)</h3><small class="subtle">Showing the latest ${Math.min(500, total)}</small></div><div class="cc-table-wrap"><table class="cc-table pa-table"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Project</th><th>Record</th></tr></thead><tbody>${entries.map((e) => `<tr><td>${paTime(e.at)}</td><td><b>${paEsc(e.actorName)}</b><small>${paEsc(e.actorRole)} · ${paEsc(e.actorEmail)}</small></td><td>${paEsc(e.action)}${e.status ? `<small>${paEsc(e.status)}</small>` : ""}</td><td>${paEsc(e.projectName || "—")}</td><td><small>${paEsc(e.entityId)}</small></td></tr>`).join("") || '<tr><td colspan="5">No actions recorded yet. New changes appear here automatically.</td></tr>'}</tbody></table></div></section>`,
  );
  document.getElementById("paAuditFilters").onsubmit = (e) => {
    e.preventDefault();
    const f = new URLSearchParams();
    for (const [k, v] of new FormData(e.target)) if (v) f.set(k, v);
    navigate("/admin/audit?" + f);
  };
}

const paBaseCompleteProject = completeProject;
completeProject = async function (id) {
  if (
    !(await uiConfirm(
      "Close this project? All phases are complete; suppliers are notified and the project is closed for new work.",
    ))
  )
    return;
  try {
    await api(`/projects/${id}/complete`, { method: "POST" });
    toast("Project completed and closed");
    await route();
    paReviewSuppliers(id);
  } catch (e) {
    toast(e.message, "error");
  }
};
async function paReviewSuppliers(pid) {
  const { suppliers = [] } = await api(`/projects/${pid}/reviews`);
  const pending = suppliers.filter((s) => !s.review);
  if (!pending.length) return;
  const stars = (name, label) =>
    `<label>${label}<select name="${name}" required>${[5, 4, 3, 2, 1].map((n) => `<option value="${n}">${"★".repeat(n)}${"☆".repeat(5 - n)} · ${n}</option>`).join("")}</select></label>`;
  modal(
    "Review supplier performance",
    `<p class="subtle">Your ratings appear on each supplier's public profile and feed into badge reviews.</p>${pending.map((s) => `<form class="modal-form pa-review-form" data-supplier="${s.id}"><h3>${paEsc(s.company)}</h3><div class="two">${stars("rating", "Overall rating")}${stars("quality", "Quality of work")}</div><div class="two">${stars("schedule", "Schedule reliability")}${stars("communication", "Communication")}</div><label>Comment<textarea name="text" rows="2" maxlength="2000" placeholder="What went well, what could improve?"></textarea></label><div class="form-error" role="alert"></div><button class="btn primary">Submit review</button></form>`).join("")}`,
  );
  document.querySelectorAll(".pa-review-form").forEach(
    (form) =>
      (form.onsubmit = async (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(form));
        try {
          await api("/reviews", {
            method: "POST",
            body: { projectId: pid, supplierId: form.dataset.supplier, ...f },
          });
          form.innerHTML = `<p class="success-text">✓ Review saved for ${paEsc(form.querySelector("h3")?.textContent || "supplier")}</p>`;
          toast("Review submitted");
          if (!document.querySelector(".pa-review-form button")) {
            closeModal();
            route();
          }
        } catch (x) {
          form.querySelector(".form-error").textContent = x.message;
        }
      }),
  );
}

/* ---------- Supplier progress updates: comments and milestones ---------- */
wfUpdateProgress = async function (pid, phid, tid, current) {
  modal(
    "Update task progress",
    `<form id="paProgressForm" class="modal-form"><div class="two"><label>Progress complete (%)<input name="progress" type="range" min="0" max="100" step="5" value="${Number(current) || 0}" oninput="this.nextElementSibling.value=this.value+'%'"><output>${Number(current) || 0}%</output></label><label>Work status<select name="status"><option>Not Started</option><option ${current > 0 && current < 100 ? "selected" : ""}>In Progress</option><option ${current >= 100 ? "selected" : ""}>Completed</option></select></label></div><label>Milestone reached (optional)<input name="milestone" maxlength="140" placeholder="e.g. Frame welded and painted"></label><label>Progress note for the customer<textarea name="note" rows="3" maxlength="2000" placeholder="What was done, what is next, any risks or delays"></textarea></label><p class="subtle">Upload deliverables in the project document desk so the customer can review them.</p><div id="paProgressError" class="form-error"></div><div class="cc-actions"><button class="btn primary">Save progress</button><button type="button" class="btn outline" onclick="closeModal();navigate('/supplier/projects/${pid}/documents')">Upload deliverable</button></div></form>`,
  );
  document.getElementById("paProgressForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api(`/projects/${pid}/phases/${phid}/tasks/${tid}`, {
        method: "PATCH",
        body: {
          progress: Number(f.get("progress")),
          status: f.get("status"),
          note: f.get("note"),
          milestone: f.get("milestone"),
        },
      });
      closeModal();
      toast("Progress update sent to the customer");
      route();
    } catch (x) {
      document.getElementById("paProgressError").textContent = x.message;
    }
  };
};
/* Task pages show the supplier's progress history. */
async function paTaskUpdates(pid, tid) {
  const content =
    document.querySelector(".dashboard-content .cc-page") || document.querySelector(".dashboard-content");
  if (!content || content.querySelector(".pa-updates")) return;
  const project = await api(`/projects/${pid}`)
      .then((d) => d.project)
      .catch(() => null),
    task = project?.phases.flatMap((ph) => ph.tasks || []).find((t) => t.id === tid);
  if (!task) return;
  const ph = project.phases.find((x) => (x.tasks || []).some((t) => t.id === tid)),
    mine = state.user.role === "supplier" && task.assignedSupplierId === state.user.supplierId;
  content.insertAdjacentHTML(
    "beforeend",
    `<section class="panel pa-updates"><div class="panel-title"><h3>Progress updates · ${Number(task.progress) || 0}%</h3>${mine && task.acceptanceStatus === "Accepted" ? `<button class="btn small primary" onclick="wfUpdateProgress('${pid}','${ph.id}','${tid}',${Number(task.progress) || 0})">Post update</button>` : ""}</div>${(task.progressUpdates || []).map((u) => `<div class="pa-update"><span class="pa-pill ${u.milestone ? "green" : "blue"}">${u.progress}%</span><div><b>${u.milestone ? "🏁 " + paEsc(u.milestone) : paEsc(u.status)}</b>${u.note ? `<p>${paEsc(u.note)}</p>` : ""}<small>${paEsc(u.byName)} · ${paEsc(u.company)} · ${paTime(u.at)}</small></div></div>`).join("") || '<p class="pa-empty">No progress updates posted yet.</p>'}</section>`,
  );
}

/* ---------- Profile & settings per role ---------- */
const paBaseProfilePage = profilePage;
profilePage = async function (role) {
  if (role === "admin") return paAdminSettings();
  await paBaseProfilePage(role);
  const content = document.querySelector(".dashboard-content");
  if (!content) return;
  if (role !== "supplier")
    [...content.querySelectorAll(".panel")]
      .find((p) => p.querySelector("h3")?.textContent === "Supplier marketplace profile")
      ?.remove();
  content.insertAdjacentHTML("beforeend", await paSettingsPanels(role));
  paBindSettings();
};
async function paAdminSettings() {
  const d = await api("/profile");
  state.user = { ...state.user, ...d.user };
  app.innerHTML = dashboardShell(
    "admin",
    "profile",
    `<div class="dash-top"><div><div class="eyebrow">ADMIN ACCOUNT</div><h1>Account settings</h1><p>Your administrator account, security and notification preferences. Marketplace-wide settings live in Platform management.</p></div><button class="btn outline" onclick="navigate('/admin/platform')">Platform management</button></div>
    <section class="panel"><h3>Administrator</h3><div class="pa-kv"><span>Name</span><b>${paEsc(d.user.name)}</b><span>Email</span><b>${paEsc(d.user.email)}</b><span>Role</span><b>Administrator · full access to vetting, users, billing, reports and settings</b></div></section>${await paSettingsPanels("admin")}`,
  );
  paBindSettings();
}
async function paSettingsPanels(role) {
  const { user } = await api("/profile"),
    prefs = user.notificationPrefs || {},
    p = user.payoutDetails;
  const cats = [
    ["messages", "New messages"],
    ["invoices", "Invoices & payments"],
    ["documents", "Documents & approvals"],
    ["bids", "Bids, offers & quote requests"],
    ["projects", "Project & assignment updates"],
    ["time", "Time entries"],
  ];
  return `<div class="pa-settings">
    <section class="panel" id="paSecurity"><h3>Security</h3><p class="subtle">${user.passwordChangedAt ? `Password last changed ${date(user.passwordChangedAt)}.` : "Choose a strong, unique password."}</p><form id="paPasswordForm" class="modal-form"><label>Current password<input name="currentPassword" type="password" autocomplete="current-password" required></label><div class="two"><label>New password<input name="newPassword" type="password" autocomplete="new-password" minlength="10" required></label><label>Repeat new password<input name="confirm" type="password" autocomplete="new-password" minlength="10" required></label></div><small class="subtle">At least 10 characters with letters and numbers. Other signed-in devices are signed out.</small><div class="form-error" role="alert"></div><div class="cc-actions"><button class="btn primary">Change password</button><button type="button" class="btn outline" onclick="paSignOutOthers()">Sign out other sessions</button></div></form></section>
    <section class="panel"><h3>Email notifications</h3><p class="subtle">In-app notifications are always on. Choose which events also send an email copy.</p><form id="paPrefsForm" class="pa-prefs">${cats.map(([k, l]) => `<label class="cc-check-label"><input type="checkbox" name="${k}" ${prefs[k] ? "checked" : ""}> ${l}</label>`).join("")}<div><button class="btn outline small">Save preferences</button></div></form></section>
    ${
      role === "supplier"
        ? `<section class="panel"><h3>Payouts & billing details</h3><p class="subtle">Where customers pay approved invoices. Shown on your invoice PDFs and to CraftCrew administrators only.</p>${p ? `<div class="pa-kv"><span>Account holder</span><b>${paEsc(p.accountHolder)}</b><span>IBAN</span><b>${paEsc(p.iban.slice(0, 4) + " •••• " + p.iban.slice(-4))}</b><span>BIC</span><b>${paEsc(p.bic || "—")}</b><span>Bank</span><b>${paEsc(p.bankName || "—")}</b><span>Billing email</span><b>${paEsc(p.billingEmail || user.email)}</b></div>` : '<p class="danger-text">No payout account yet — add one so approved invoices can be paid.</p>'}<form id="paPayoutForm" class="modal-form" ${p ? "hidden" : ""}><div class="two"><label>Account holder *<input name="accountHolder" value="${paEsc(p?.accountHolder || user.companyProfile?.legalName || user.company || "")}" required></label><label>Bank name<input name="bankName" value="${paEsc(p?.bankName || "")}"></label></div><div class="two"><label>IBAN *<input name="iban" placeholder="DE89 3704 0044 0532 0130 00" required></label><label>BIC / SWIFT<input name="bic" value="${paEsc(p?.bic || "")}"></label></div><label>Billing email<input name="billingEmail" type="email" value="${paEsc(p?.billingEmail || "")}"></label><div class="form-error" role="alert"></div><button class="btn primary">Save payout details</button></form>${p ? '<button class="btn outline small" onclick="document.getElementById(\'paPayoutForm\').hidden=false;this.remove()">Change payout account</button>' : ""}</section>
    <section class="panel"><h3>Team & roles</h3><p class="subtle">Key people, roles and certifications are managed in your service catalog and shown on your public profile.</p><button class="btn outline" onclick="navigate('/supplier/suppliers')">Manage team & service catalog</button></section>`
        : ""
    }
  </div>`;
}
function paBindSettings() {
  const pw = document.getElementById("paPasswordForm");
  if (pw)
    pw.onsubmit = async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(pw)),
        err = pw.querySelector(".form-error");
      err.textContent = "";
      if (f.newPassword !== f.confirm) {
        err.textContent = "The new passwords do not match";
        return;
      }
      try {
        await api("/account/password", { method: "POST", body: f });
        pw.reset();
        toast("Password changed");
      } catch (x) {
        err.textContent = x.message;
      }
    };
  const prefs = document.getElementById("paPrefsForm");
  if (prefs)
    prefs.onsubmit = async (e) => {
      e.preventDefault();
      const np = {};
      prefs.querySelectorAll("input[type=checkbox]").forEach((c) => (np[c.name] = c.checked));
      try {
        await api("/account/preferences", { method: "PUT", body: { notificationPrefs: np } });
        toast("Notification preferences saved");
      } catch (x) {
        toast(x.message, "error");
      }
    };
  const pay = document.getElementById("paPayoutForm");
  if (pay)
    pay.onsubmit = async (e) => {
      e.preventDefault();
      const err = pay.querySelector(".form-error");
      err.textContent = "";
      try {
        await api("/account/payout", { method: "PUT", body: Object.fromEntries(new FormData(pay)) });
        toast("Payout details saved");
        profilePage("supplier");
      } catch (x) {
        err.textContent = x.message;
      }
    };
}
async function paSignOutOthers() {
  try {
    const r = await api("/account/sessions", { method: "DELETE" });
    toast(`${r.revoked} other session(s) signed out`);
  } catch (x) {
    toast(x.message, "error");
  }
}

/* ---------- Admin: email outbox on the platform page, audit link in navigation ---------- */
async function paOutboxPanel() {
  const content = document.querySelector(".dashboard-content");
  if (!content || content.querySelector(".pa-outbox")) return;
  const { emails = [] } = await api("/admin/outbox").catch(() => ({}));
  content.insertAdjacentHTML(
    "beforeend",
    `<details class="panel pa-outbox"><summary><h3>Email outbox</h3><small>${emails.length} message(s) · ${emails.filter((m) => m.status === "Sent").length} sent</small></summary><div class="cc-table-wrap"><table class="cc-table pa-table"><thead><tr><th>Queued</th><th>To</th><th>Subject</th><th>Status</th></tr></thead><tbody>${
      emails
        .slice(0, 100)
        .map(
          (m) =>
            `<tr title="${paEsc(m.body)}"><td>${paTime(m.createdAt)}</td><td>${paEsc(m.to)}</td><td><b>${paEsc(m.subject)}</b><small>${paEsc(m.body.slice(0, 120))}</small></td><td><span class="status ${m.status === "Sent" ? "completed" : m.status === "Failed" ? "rejected" : "submitted"}">${paEsc(m.status)}</span>${m.lastError ? `<small>${paEsc(m.lastError)}</small>` : ""}</td></tr>`,
        )
        .join("") || '<tr><td colspan="4">No emails yet.</td></tr>'
    }</tbody></table></div></details>`,
  );
}

/* ---------- Session integrity ----------
   The stored user record is only a display cache. On load the session token is
   confirmed with the server, and the identity shown always comes from the server.
   Any 401 (expired, revoked or suspended session) signs the browser out. */
function paClearSession(message) {
  // An ended session keeps the page the user wanted; the login form explains why (see not-found.js).
  if (message)
    try {
      if (/^#\/(customer|supplier|admin)\//.test(location.hash))
        sessionStorage.setItem("cc_return", location.hash);
      sessionStorage.setItem("cc_expired", "1");
    } catch {}
  state.user = null;
  state.token = "";
  localStorage.removeItem("cc_user");
  localStorage.removeItem("cc_token");
  document.body.classList.remove("authenticated");
  topActions();
  if (/^#\/(customer|supplier|admin)(\/|$)/.test(location.hash)) navigate("/login");
  else route();
}
const paBaseApi = api;
api = async function (path, opts = {}) {
  const tokenUsed = state.token;
  try {
    return await paBaseApi(path, opts);
  } catch (e) {
    if (tokenUsed && tokenUsed === state.token && /^Authentication required$/.test(e.message))
      paClearSession("Your session has ended. Please sign in again.");
    throw e;
  }
};
async function paVerifySession() {
  if (!state.token) {
    if (state.user) paClearSession();
    return;
  }
  try {
    await ccSessionReady;
    const r = await fetch("/api/auth/me", { credentials: "same-origin" });
    if (r.status === 401 || r.status === 403)
      return paClearSession("Your session has ended. Please sign in again.");
    if (!r.ok) return;
    const { user } = await r.json(),
      changed = !state.user || state.user.id !== user.id || state.user.role !== user.role;
    state.user = user;
    localStorage.setItem("cc_user", JSON.stringify(user));
    if (changed) route();
    else topActions();
  } catch {}
}
const paBaseTopActions = topActions;
topActions = function () {
  paBaseTopActions();
  const el = document.getElementById("topActions");
  if (!el || !state.user) return;
  // Signed in: one compact account chip, the way back to the workspace, and sign-out.
  const u = state.user,
    initials = String(u.name || "U")
      .split(" ")
      .map((x) => x[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  const roleLabel = { customer: "Customer", supplier: "Supplier", admin: "Admin" }[u.role] || u.role;
  el.innerHTML = `<button type="button" class="pa-account" onclick="navigate('/${u.role}/profile')" title="Profile / Settings"><span class="avatar">${paEsc(initials)}</span><span class="pa-account-text"><b>${paEsc(u.name)}</b><small>${paEsc(roleLabel)}</small></span></button><button type="button" class="btn primary" onclick="navigate('/${u.role}/dashboard')">Dashboard</button><button type="button" class="btn outline" onclick="logout()">Log out</button>`;
};
paVerifySession();

/* ---------- Router hook ---------- */
const paBaseRoute = window.route;
let paRouteSeq = 0,
  paRouteDone = 0;
window.route = async function () {
  const path = location.hash.replace(/^#/, "").split("?")[0],
    parts = path.split("/").filter(Boolean),
    seq = ++paRouteSeq;
  if (parts[0] === "admin" && parts[1] === "audit" && state.user?.role === "admin") {
    try {
      await paAuditPage();
    } catch (e) {
      toast(e.message, "error");
    }
    paRouteDone = Math.max(paRouteDone, seq);
    return;
  }
  const result = await paBaseRoute();
  // A slower, older navigation must not leave its page on screen after a newer one rendered.
  if (seq < paRouteDone) return window.route();
  paRouteDone = Math.max(paRouteDone, seq);
  if (seq !== paRouteSeq) return result;
  try {
    if (
      ["customer", "supplier"].includes(parts[0]) &&
      parts[1] === "projects" &&
      parts[2] &&
      parts[2] !== "new"
    ) {
      if (parts[3] === "tasks" && parts[4]) await paTaskUpdates(parts[2], parts[4]);
    }
    if (parts[0] === "admin" && parts[1] === "platform") await paOutboxPanel();
  } catch (e) {
    console.error(e);
  }
  return result;
};
