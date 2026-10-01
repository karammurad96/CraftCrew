/* Preferred suppliers (T68): a customer's private list with notes and tags, email invitations for suppliers
   who are not on CraftCrew yet, and "Invite my preferred suppliers" in the bid form. */
const pvEsc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
let pvData = { suppliers: [], invites: [] };
const pvLoad = async () => (pvData = await api("/preferred-suppliers"));

async function pvPage() {
  await pvLoad();
  const rows = pvData.suppliers
    .map(
      (s) =>
        `<article class="cc-card pv-card"><div class="pv-head"><div><h3><a href="#/customer/suppliers/${pvEsc(s.supplierId)}">${pvEsc(s.company)}</a></h3><small>${pvEsc(s.location)}${s.badge ? ` · ${pvEsc(s.badge)}` : ""}</small></div>${s.invited ? '<span class="tag">Joined by invitation</span>' : ""}</div><div class="pv-tags">${(s.tags || []).map((t) => `<span class="chip">${pvEsc(t)}</span>`).join("")}</div>${s.note ? `<p class="pv-note">${pvEsc(s.note)}</p>` : '<p class="subtle">No note yet.</p>'}<div class="cc-actions"><button class="btn small outline" onclick="pvEdit('${pvEsc(s.supplierId)}')">Edit note and tags</button><button class="btn small outline" onclick="pvRemove('${pvEsc(s.supplierId)}')">Remove</button></div></article>`,
    )
    .join("");
  const invites = pvData.invites
    .map(
      (i) =>
        `<tr><td><b>${pvEsc(i.company)}</b><small>${pvEsc(i.email)}</small></td><td><span class="status ${i.status === "Joined" ? "completed" : "submitted"}">${i.status === "Joined" ? "Joined" : "Invited"}</span></td><td>${date(i.createdAt)}</td></tr>`,
    )
    .join("");
  app.innerHTML = dashboardShell(
    "customer",
    "preferred",
    `<div class="dash-top"><div><h1>Preferred suppliers</h1><p>Your own list of trusted suppliers, with private notes and tags. Only your company sees it.</p></div><button class="btn outline" onclick="navigate('/customer/suppliers')">Find suppliers</button></div>
    <div class="pv-grid">${rows || '<div class="empty">No preferred suppliers yet. Open a supplier profile and choose "Add to preferred suppliers", or invite a supplier below.</div>'}</div>
    <section class="panel"><div class="panel-title"><h2>Invite a supplier who is not on CraftCrew</h2></div><form id="pvInvite" class="modal-form"><div class="two"><label>Company<input name="company" required maxlength="160"></label><label>Email<input name="email" type="email" required maxlength="200"></label></div><div class="two"><label>Tags (comma separated)<input name="tags" maxlength="200" placeholder="e.g. Electrical, Bavaria"></label><label>Private note<input name="note" maxlength="2000"></label></div><div id="pvError" class="form-error" role="alert"></div><button class="btn primary">Send invitation</button></form>${invites ? `<div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Supplier</th><th>Status</th><th>Invited</th></tr></thead><tbody>${invites}</tbody></table></div>` : ""}</section>`,
  );
  document.getElementById("pvInvite").onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try {
      await api("/preferred-suppliers/invite", { method: "POST", body: f });
      toast("Invitation sent");
      pvPage();
    } catch (x) {
      document.getElementById("pvError").textContent = x.message;
    }
  };
}
function pvEdit(supplierId) {
  const s = pvData.suppliers.find((x) => x.supplierId === supplierId) || { tags: [], note: "" };
  modal(
    "Edit note and tags",
    `<form id="pvEditForm" class="modal-form"><label>Tags (comma separated)<input name="tags" maxlength="400" value="${pvEsc((s.tags || []).join(", "))}"></label><label>Private note<textarea name="note" rows="4" maxlength="2000">${pvEsc(s.note || "")}</textarea></label><div id="pvEditError" class="form-error" role="alert"></div><button class="btn primary">Save</button></form>`,
  );
  document.getElementById("pvEditForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api(`/preferred-suppliers/${encodeURIComponent(supplierId)}`, {
        method: "PUT",
        body: { tags: f.get("tags"), note: f.get("note") },
      });
      closeModal();
      toast("Saved");
      if (location.hash.startsWith("#/customer/preferred")) pvPage();
      else route();
    } catch (x) {
      document.getElementById("pvEditError").textContent = x.message;
    }
  };
}
async function pvRemove(supplierId) {
  if (!(await uiConfirm("Remove this supplier from your preferred list? Your note and tags are deleted.")))
    return;
  await api(`/preferred-suppliers/${encodeURIComponent(supplierId)}`, { method: "DELETE" });
  toast("Removed from your preferred suppliers");
  pvPage();
}
async function pvAdd(supplierId) {
  try {
    await api(`/preferred-suppliers/${encodeURIComponent(supplierId)}`, { method: "PUT", body: {} });
    await pvLoad();
    toast("Added to your preferred suppliers");
    pvEdit(supplierId);
  } catch (x) {
    toast(x.message);
  }
}

// Supplier profile: add to the list, or show that the supplier is on it.
const pvBaseSupplierDetail = supplierDetail;
supplierDetail = async function (id) {
  await pvBaseSupplierDetail(id);
  if (state.user?.role !== "customer") return;
  await pvLoad().catch(() => {});
  const head = document.querySelector(".supplier-profile-head");
  if (!head || head.querySelector(".pv-profile")) return;
  const on = pvData.suppliers.some((s) => s.supplierId === id);
  head.insertAdjacentHTML(
    "beforeend",
    `<div class="pv-profile">${
      on
        ? `<span class="status completed">On your preferred list</span><button class="btn small outline" onclick="pvEdit('${pvEsc(id)}')">Edit note and tags</button>`
        : `<button class="btn small primary" onclick="pvAdd('${pvEsc(id)}')">Add to preferred suppliers</button>`
    }</div>`,
  );
};

// Bid form: "Invite my preferred suppliers" limits the request to the preferred list.
let pvInviteNext = null;
const pvBaseApi = api;
api = async function (path, opts = {}) {
  if (
    path === "/bids" &&
    opts.method === "POST" &&
    pvInviteNext &&
    opts.body &&
    typeof opts.body === "object"
  ) {
    opts.body.invitedSupplierIds = [...new Set([...(opts.body.invitedSupplierIds || []), ...pvInviteNext])];
    pvInviteNext = null;
  }
  return pvBaseApi(path, opts);
};
const pvBaseCreateBid = wfCreateBid;
wfCreateBid = async function (...args) {
  await pvBaseCreateBid(...args);
  const form = document.getElementById("srEventForm");
  if (!form) return;
  await pvLoad().catch(() => {});
  const ids = pvData.suppliers.filter((s) => s.live).map((s) => s.supplierId);
  form
    .querySelector(".form-error")
    ?.insertAdjacentHTML(
      "beforebegin",
      `<label class="cc-check-label pv-invite"><input type="checkbox" id="pvInviteBox" ${ids.length ? "" : "disabled"}> Invite my preferred suppliers (${ids.length}) <small class="subtle">Only they can send offers. Leave unticked to let every matching supplier bid.</small></label>`,
    );
  const base = form.onsubmit;
  form.onsubmit = (e) => {
    pvInviteNext = document.getElementById("pvInviteBox")?.checked ? ids : null;
    return base(e);
  };
};
// Inviting suppliers to an existing bid: tick the preferred ones in one click.
const pvBaseInviteBid = reviewInviteBid;
reviewInviteBid = async function (bidId) {
  await pvBaseInviteBid(bidId);
  const form = document.getElementById("reviewInviteForm");
  if (!form) return;
  await pvLoad().catch(() => {});
  if (!pvData.suppliers.length) return;
  form
    .querySelector(".review-invite-list")
    ?.insertAdjacentHTML(
      "beforebegin",
      '<button type="button" class="btn small outline pv-invite" onclick="pvTickPreferred()">Select my preferred suppliers</button>',
    );
};
function pvTickPreferred() {
  for (const s of pvData.suppliers) {
    const box = document.querySelector(
      `#reviewInviteForm input[name="supplierIds"][value="${CSS.escape(s.supplierId)}"]`,
    );
    if (box && !box.disabled) box.checked = true;
  }
}
