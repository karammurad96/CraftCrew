/* Supplier directory add-ons (T62): compare up to 3 suppliers side by side, a private shortlist for customers,
   and one quote request to several suppliers (POST /api/bids with invitedSupplierIds). */
const dirEsc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const DIR_MAX = 3;
let dirShortlist = [];

function dirSelected() {
  try {
    const ids = JSON.parse(sessionStorage.getItem("cc_compare") || "[]");
    return Array.isArray(ids) ? ids.slice(0, DIR_MAX) : [];
  } catch {
    return [];
  }
}
function dirSetSelected(ids) {
  try {
    sessionStorage.setItem("cc_compare", JSON.stringify(ids.slice(0, DIR_MAX)));
  } catch {}
}
async function dirLoadShortlist() {
  try {
    dirShortlist = (await api("/shortlist")).supplierIds || [];
  } catch {
    dirShortlist = [];
  }
  return dirShortlist;
}

function dirCardPicks(s, customer, shortlist) {
  const picked = dirSelected().includes(s.id),
    starred = (shortlist || []).includes(s.id);
  return `<div class="dir-picks"><label class="cc-check-label"><input type="checkbox" class="dir-compare" value="${dirEsc(s.id)}" ${picked ? "checked" : ""} onchange="dirToggleCompare(this)"> Compare</label>${
    customer
      ? `<button type="button" class="btn small outline dir-star" aria-pressed="${starred}" onclick="dirToggleShortlist('${dirEsc(s.id)}', this)">${starred ? "★ On shortlist" : "☆ Shortlist"}</button>`
      : ""
  }</div>`;
}

function dirBarInner() {
  const n = dirSelected().length,
    customer = state.user?.role === "customer";
  return `<span><b>${n}</b> <span>of 3 selected</span></span><div class="cc-actions"><button type="button" class="btn small primary" onclick="dirCompare()" ${n < 2 ? "disabled" : ""}>Compare</button>${
    customer
      ? `<button type="button" class="btn small success" onclick="dirRequestQuotes()" ${n ? "" : "disabled"}>Request quotes from selected</button>`
      : ""
  }<button type="button" class="btn small outline" onclick="dirClear()">Clear</button></div>`;
}
function dirBarHtml() {
  return `<div class="dir-bar" id="dirBar" role="region" aria-label="Selected suppliers" ${dirSelected().length ? "" : "hidden"}>${dirBarInner()}</div>`;
}
function dirUpdateBar() {
  const bar = document.getElementById("dirBar");
  if (!bar) return;
  bar.innerHTML = dirBarInner();
  bar.hidden = !dirSelected().length;
}

function dirToggleCompare(input) {
  let ids = dirSelected().filter((x) => x !== input.value);
  if (input.checked) {
    if (ids.length >= DIR_MAX) {
      input.checked = false;
      toast("Compare up to 3 suppliers");
      return;
    }
    ids.push(input.value);
  }
  dirSetSelected(ids);
  dirUpdateBar();
}
function dirClear() {
  dirSetSelected([]);
  document.querySelectorAll(".dir-compare").forEach((x) => (x.checked = false));
  dirUpdateBar();
}

async function dirToggleShortlist(id, btn) {
  const on = !dirShortlist.includes(id),
    next = on ? [...dirShortlist, id] : dirShortlist.filter((x) => x !== id);
  try {
    dirShortlist = (await api("/shortlist", { method: "PUT", body: { supplierIds: next } })).supplierIds;
    btn.setAttribute("aria-pressed", String(on));
    btn.textContent = on ? "★ On shortlist" : "☆ Shortlist";
    toast(on ? "Added to your shortlist" : "Removed from your shortlist");
  } catch (e) {
    toast(e.message);
  }
}

async function dirSuppliers(ids) {
  return (await Promise.all(ids.map((id) => api("/suppliers/" + encodeURIComponent(id)).catch(() => null))))
    .map((r) => r?.supplier)
    .filter(Boolean);
}

async function dirCompare() {
  const list = await dirSuppliers(dirSelected());
  if (list.length < 2) return toast("Select at least 2 suppliers to compare");
  const lead = (s) =>
    [...new Set((s.serviceCatalog || []).map((x) => x.leadTime).filter(Boolean))].join(", ") || "On request";
  const rows = [
    ["Location", (s) => dirEsc(s.location || "—")],
    ["Badge", (s) => dirEsc(supplierBadge(s))],
    ["Services", (s) => dirEsc((s.services || []).join(", ") || "—")],
    ["Certifications", (s) => dirEsc((s.certifications || []).join(", ") || "—")],
    ["Hourly rate", (s) => `${money(s.hourlyRate || 0)}/h`],
    ["Projects from", (s) => money(s.projectRate || 0)],
    ["Rating", (s) => `★ ${Number(s.rating || 0).toFixed(1)}`],
    ["Reliability", (s) => ccReliability(s)],
    ["Team size", (s) => String(Number(s.employees) || "—")],
    ["Lead time", (s) => dirEsc(lead(s))],
    ["Availability", (s) => dirEsc(s.availability || "On request")],
  ];
  modal(
    "Compare suppliers",
    `<div class="cc-table-wrap"><table class="cc-table dir-compare-table"><thead><tr><th scope="col"><span class="sr-only">Detail</span></th>${list.map((s) => `<th scope="col">${dirEsc(s.company)}</th>`).join("")}</tr></thead><tbody>${rows
      .map(
        ([label, cell]) =>
          `<tr><th scope="row">${label}</th>${list.map((s) => `<td>${cell(s)}</td>`).join("")}</tr>`,
      )
      .join(
        "",
      )}</tbody></table></div><div class="cc-actions">${state.user?.role === "customer" ? `<button type="button" class="btn primary" onclick="dirRequestQuotes()">Request quotes from these suppliers</button>` : ""}<button type="button" class="btn outline" onclick="closeModal()">Close</button></div>`,
  );
}

async function dirRequestQuotes() {
  const [list, projects] = await Promise.all([dirSuppliers(dirSelected()), ccProjects()]);
  if (!list.length) return toast("Select suppliers first");
  const open = projects.filter((p) => !["Archived", "Completed"].includes(p.status));
  if (!open.length) return toast("Create a project first, then request quotes for one of its tasks");
  const services = [...new Set(list.flatMap((s) => s.services || []))],
    due = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  modal(
    "Request quotes",
    `<form id="dirQuoteForm" class="modal-form"><p>One request to: <b>${list.map((s) => dirEsc(s.company)).join(", ")}</b></p><div class="two"><label>Project<select name="project" id="dirProject">${open.map((p) => `<option value="${dirEsc(p.id)}">${dirEsc(p.name)}</option>`).join("")}</select></label><label>Task<select name="task" id="dirTask"></select></label></div><div class="two" id="dirNewTask" hidden><label>Phase<select name="phase" id="dirPhase"></select></label><label>New task name<input name="taskName" maxlength="160"></label></div><div class="two"><label>Service<input name="service" list="dirServices" required maxlength="80" value="${dirEsc(services[0] || "")}"><datalist id="dirServices">${services.map((x) => `<option value="${dirEsc(x)}"></option>`).join("")}</datalist></label><label>Quotes due by<input name="dueDate" type="date" required min="${new Date().toISOString().slice(0, 10)}" value="${due}"></label></div><label>Description<textarea name="description" rows="4" maxlength="5000" required placeholder="Scope, quantities, site, schedule"></textarea></label><label>Attachments (up to 5 files)<input name="files" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.csv,.txt,.zip"></label><div id="dirQuoteError" class="form-error" role="alert"></div><button class="btn primary">Send request to ${list.length} supplier(s)</button></form>`,
  );
  const form = document.getElementById("dirQuoteForm"),
    projectSel = document.getElementById("dirProject"),
    taskSel = document.getElementById("dirTask");
  const fillTasks = () => {
    const p = open.find((x) => x.id === projectSel.value);
    const tasks = (p?.phases || []).flatMap((ph) =>
      (ph.tasks || [])
        .filter((t) => t.status !== "Completed")
        .map((t) => ({ value: `${ph.id}|${t.id}`, label: `${ph.name} — ${t.name}` })),
    );
    taskSel.innerHTML =
      tasks.map((t) => `<option value="${dirEsc(t.value)}">${dirEsc(t.label)}</option>`).join("") +
      '<option value="new">+ New task…</option>';
    document.getElementById("dirPhase").innerHTML = (p?.phases || [])
      .map((ph) => `<option value="${dirEsc(ph.id)}">${dirEsc(ph.name)}</option>`)
      .join("");
    document.getElementById("dirNewTask").hidden = taskSel.value !== "new";
  };
  projectSel.onchange = fillTasks;
  taskSel.onchange = () => (document.getElementById("dirNewTask").hidden = taskSel.value !== "new");
  fillTasks();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(form),
      error = document.getElementById("dirQuoteError"),
      button = form.querySelector("button.primary"),
      files = [...form.files.files];
    if (files.length > 5) return (error.textContent = "Attach up to five files");
    button.disabled = true;
    try {
      const projectId = f.get("project");
      let [phaseId, taskId] = String(f.get("task")).split("|");
      if (f.get("task") === "new") {
        const name = String(f.get("taskName") || "").trim();
        if (!name) throw new Error("Enter a name for the new task");
        phaseId = f.get("phase");
        taskId = (
          await api(`/projects/${projectId}/phases/${phaseId}/tasks`, {
            method: "POST",
            body: { name, dueDate: f.get("dueDate"), description: f.get("description") },
          })
        ).task.id;
      }
      const attachments = [];
      for (const file of files) attachments.push((await uploadFile(file)).url);
      await api("/bids", {
        method: "POST",
        body: {
          projectId,
          phaseId,
          taskId,
          title: `${f.get("service")} — quote request`,
          category: f.get("service"),
          description: f.get("description"),
          dueDate: f.get("dueDate"),
          invitedSupplierIds: list.map((s) => s.id),
          attachments,
        },
      });
      closeModal();
      dirClear();
      toast(`Quote request sent to ${list.length} supplier(s)`);
      navigate("/customer/offers");
    } catch (x) {
      error.textContent = x.message;
      button.disabled = false;
    }
  };
}

function dirRegionNotice(region) {
  return region && !region.found
    ? '<div class="notice" role="status">We don\'t know this place. Try a nearby city or a German postcode.</div>'
    : "";
}
