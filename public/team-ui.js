/* Team members: the main account invites colleagues and decides per area whether they get no access,
   view-only or full access. Members see only the areas they may use; the server enforces every limit. */
const TM_LEVELS = [
  ["none", "No access"],
  ["view", "View only"],
  ["full", "Full access"],
];
// Sidebar entry → access area. Entries not listed (dashboard, inbox, suppliers, profile) stay visible.
const TM_NAV = {
  customer: {
    projects: "projects",
    offers: "sourcing",
    bids: "sourcing",
    contracts: "sourcing",
    sourcing: "sourcing",
    invoices: "invoices",
    time: "time",
    sites: "compliance",
    messages: "messages",
    analytics: "analytics",
  },
  supplier: {
    phases: "projects",
    projects: "projects",
    requests: "sourcing",
    bids: "sourcing",
    contracts: "sourcing",
    invoices: "invoices",
    time: "time",
    compliance: "compliance",
    messages: "messages",
    suppliers: "catalog",
    catalog: "catalog",
  },
};
// List endpoints a member without access would otherwise hit on shared pages like the dashboard.
const TM_API = {
  projects: "projects",
  documents: "projects",
  reviews: "projects",
  disputes: "projects",
  bids: "sourcing",
  rfqs: "sourcing",
  contracts: "sourcing",
  scorecards: "sourcing",
  invoices: "invoices",
  "time-entries": "time",
  sites: "compliance",
  workers: "compliance",
  "site-visits": "compliance",
  chats: "messages",
  messages: "messages",
};
const tmLevel = (area) => (state.user?.isMember ? state.user.permissions?.[area] || "none" : "full");
const tmIsOwner = () => ["customer", "supplier"].includes(state.user?.role) && !state.user?.isMember;

Object.assign(UI_NAV_ICONS, { team: "users" });

/* Members: skip requests to areas without access and answer them with empty lists instead of errors. */
const tmBaseApi = api;
api = async function (path, opts = {}) {
  const [top, ...rest] = path.split("?")[0].split("/").filter(Boolean);
  if (
    state.user?.isMember &&
    (!opts.method || opts.method === "GET") &&
    !rest.length &&
    TM_API[top] &&
    tmLevel(TM_API[top]) === "none"
  )
    return new Proxy({}, { get: (t, k) => (k === "then" || typeof k === "symbol" ? undefined : []) });
  return tmBaseApi(path, opts);
};

/* ---------- Team page (main account) ---------- */
async function tmPage() {
  const { modules, members } = await api("/team"),
    active = members.filter((m) => m.status !== "Suspended"),
    removed = members.filter((m) => m.status === "Suspended");
  const role = state.user.role,
    keys = Object.keys(modules);
  app.innerHTML = dashboardShell(
    role,
    "team",
    `<div class="dash-top"><div><div class="eyebrow">ACCOUNT</div><h1>Team</h1><p>Invite colleagues and decide for each area whether they have no access, can only view, or can work fully. Only you can manage the team.</p></div><button class="btn primary" onclick="tmInvite()">+ Invite team member</button></div>
    <div class="in-kpis">${inKpi("Team members", active.length, "with access to this account")}${inKpi("Invitations open", active.filter((m) => m.invitePending).length, "not signed in yet", active.some((m) => m.invitePending) ? "warn" : "good")}${inKpi("Full access", active.filter((m) => keys.every((k) => m.permissions[k] === "full")).length, "to every area")}${inKpi("Removed", removed.length, "no longer have access")}</div>
    ${
      active.length
        ? `<section class="panel"><div class="panel-title"><h3>Members and access</h3><span class="ui-count">${active.length}</span></div><div class="table-wrap tm-table-wrap"><table class="tm-table"><thead><tr><th>Member</th>${keys.map((k) => `<th title="${esc(modules[k])}">${esc(tmShort(k))}</th>`).join("")}<th class="actions">Actions</th></tr></thead><tbody>
      ${active
        .map(
          (
            m,
          ) => `<tr><td><b>${esc(m.name)}</b><small>${esc(m.email)}${m.jobTitle ? " · " + esc(m.jobTitle) : ""}</small><small>${m.invitePending ? '<span class="status pending">Invited</span>' : `Last sign-in ${m.lastLoginAt ? paTime(m.lastLoginAt) : "—"}`}</small></td>
        ${keys.map((k) => `<td><select class="tm-level tm-${m.permissions[k] || "none"}" aria-label="${esc(modules[k])} for ${esc(m.name)}" onchange="tmSetLevel('${m.id}','${k}',this)">${TM_LEVELS.map(([v, l]) => `<option value="${v}" ${m.permissions[k] === v ? "selected" : ""}>${l}</option>`).join("")}</select></td>`).join("")}
        <td class="actions"><div class="cc-actions"><button class="btn small outline" onclick="tmEdit('${m.id}')">Edit</button><button class="btn small outline danger-text" onclick="tmRemove('${m.id}')">Remove</button></div></td></tr>`,
        )
        .join("")}
      </tbody></table></div></section>`
        : `<section class="panel cm-empty">${uiIcon("users", "ui-icon cm-empty-icon")}<h3>Work together as a team</h3><p>Invite buyers, project managers, accounting or site staff. Each person signs in with their own login, and every action is recorded under their name.</p><button class="btn primary" onclick="tmInvite()">+ Invite team member</button></section>`
    }
    <section class="panel"><div class="panel-title"><h3>What the access levels mean</h3></div><div class="tm-legend"><div><span class="tm-dot tm-none"></span><b>No access</b><small>The area is hidden and its data cannot be opened.</small></div><div><span class="tm-dot tm-view"></span><b>View only</b><small>Can see everything in the area but cannot create, change, approve or send.</small></div><div><span class="tm-dot tm-full"></span><b>Full access</b><small>Can work in the area like you, for example approve offers or pay invoices.</small></div></div>
    <div class="tm-areas">${keys.map((k) => `<div><b>${esc(tmShort(k))}</b><small>${esc(modules[k])}</small></div>`).join("")}</div></section>
    ${removed.length ? `<details class="panel"><summary><h3>Removed members (${removed.length})</h3></summary>${removed.map((m) => `<div class="pa-row"><span><b>${esc(m.name)}</b><small>${esc(m.email)}</small></span><button class="btn small outline" onclick="tmRestore('${m.id}')">Restore access</button></div>`).join("")}</details>` : ""}`,
  );
}
const tmShort = (k) =>
  ({
    projects: "Projects",
    sourcing: "Sourcing",
    invoices: "Invoices",
    time: "Time",
    compliance: "Compliance",
    messages: "Messages",
    analytics: "Analytics",
    catalog: "Catalog",
    settings: "Settings",
  })[k] || k;

async function tmForm(title, member, onSave) {
  const { modules } = await api("/team"),
    keys = Object.keys(modules);
  const perms =
    member?.permissions ||
    Object.fromEntries(
      keys.map((k) => [k, ["settings"].includes(k) ? "none" : k === "messages" ? "full" : "view"]),
    );
  modal(
    title,
    `<form id="tmForm" class="modal-form"><div class="two"><label>Name<input name="name" required value="${esc(member?.name || "")}" autocomplete="off"></label><label>Email<input name="email" type="email" required value="${esc(member?.email || "")}" ${member ? "disabled" : ""} autocomplete="off"></label></div>
    <label>Job title <small class="subtle">optional</small><input name="jobTitle" value="${esc(member?.jobTitle || "")}" placeholder="e.g. Buyer, Project manager, Accounting"></label>
    <fieldset class="cm-fieldset"><legend>Access</legend><div class="tm-presets"><span class="subtle">Set all to</span>${TM_LEVELS.map(([v, l]) => `<button type="button" class="btn small outline" onclick="tmPreset('${v}')">${l}</button>`).join("")}</div>
      <div class="tm-matrix">${keys.map((k) => `<div class="tm-row"><div><b>${esc(tmShort(k))}</b><small>${esc(modules[k])}</small></div><div class="tm-seg" role="radiogroup" aria-label="${esc(modules[k])}">${TM_LEVELS.map(([v, l]) => `<label class="tm-seg-opt tm-${v}"><input type="radio" name="p_${k}" value="${v}" ${perms[k] === v ? "checked" : ""}><span>${l}</span></label>`).join("")}</div></div>`).join("")}</div></fieldset>
    <div id="tmError" class="form-error"></div><button class="btn primary">${member ? "Save changes" : "Send invitation"}</button></form>`,
  );
  document.getElementById("tmForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const b = {
      name: f.get("name"),
      jobTitle: f.get("jobTitle"),
      permissions: Object.fromEntries(keys.map((k) => [k, f.get("p_" + k) || "none"])),
    };
    if (!member) b.email = f.get("email");
    try {
      await onSave(b);
    } catch (x) {
      document.getElementById("tmError").textContent = x.message;
    }
  };
}
function tmPreset(level) {
  document.querySelectorAll(`#tmForm input[type=radio][value="${level}"]`).forEach((r) => {
    r.checked = true;
  });
}
function tmInvite() {
  tmForm("Invite team member", null, async (b) => {
    const r = await api("/team", { method: "POST", body: b });
    if (r.emailed) {
      closeModal();
      toast(`Invitation sent to ${r.member.email}`);
      route();
      return;
    }
    modal(
      "Team member added",
      `<div class="modal-form"><p>${esc(r.member.name)} can now sign in. Share these sign-in details personally — the temporary password is shown only once and must be changed at the first sign-in.</p>
      <div class="tm-cred"><div><span class="cc-label">Email</span><b>${esc(r.member.email)}</b></div><div><span class="cc-label">Temporary password</span><code id="tmTemp">${esc(r.temporaryPassword)}</code></div></div>
      <div class="cc-actions"><button type="button" class="btn outline" onclick="navigator.clipboard?.writeText(document.getElementById('tmTemp').textContent).then(()=>toast('Copied'))">Copy password</button><button type="button" class="btn primary" onclick="closeModal();route()">Done</button></div></div>`,
    );
  });
}
async function tmEdit(id) {
  const m = (await api("/team")).members.find((x) => x.id === id);
  if (m)
    tmForm(`Edit ${m.name}`, m, async (b) => {
      await api(`/team/${id}`, { method: "PATCH", body: b });
      closeModal();
      toast("Access updated");
      route();
    });
}
async function tmSetLevel(id, area, select) {
  const { members } = await api("/team"),
    m = members.find((x) => x.id === id);
  if (!m) return;
  try {
    await api(`/team/${id}`, {
      method: "PATCH",
      body: { permissions: { ...m.permissions, [area]: select.value } },
    });
    select.className = `tm-level tm-${select.value}`;
    toast("Access updated");
  } catch (x) {
    toast(x.message, "error");
    route();
  }
}
async function tmRemove(id) {
  if (
    !(await uiConfirm(
      "Remove this team member? They are signed out immediately and can no longer open this account. You can restore access later.",
      { confirmLabel: "Remove", danger: true },
    ))
  )
    return;
  try {
    await api(`/team/${id}`, { method: "DELETE" });
    toast("Team member removed");
    route();
  } catch (x) {
    toast(x.message, "error");
  }
}
async function tmRestore(id) {
  try {
    await api(`/team/${id}`, { method: "PATCH", body: { status: "Active" } });
    toast("Access restored");
    route();
  } catch (x) {
    toast(x.message, "error");
  }
}

/* View-only areas: a quiet hint on the page so members know why actions are refused. */
function tmViewHint(parts) {
  if (!state.user?.isMember) return;
  const area = TM_NAV[state.user.role]?.[parts[1]];
  const top = document.querySelector(".dashboard-content .dash-top");
  if (area && tmLevel(area) === "view" && top && !document.querySelector(".tm-view-hint")) {
    top.insertAdjacentHTML(
      "afterend",
      '<div class="notice tm-view-hint">You have view-only access to this area. Ask your account owner if you need to make changes.</div>',
    );
    // The page's main create action would only be refused.
    top.querySelectorAll(".btn.primary").forEach((b) => {
      b.hidden = true;
    });
  }
  // Shortcuts into areas without access lead nowhere, so hide them.
  for (const b of document.querySelectorAll(
    '.dashboard-content .btn[onclick*="navigate(\'/"], .dashboard-content a.btn[href^="#/"]',
  )) {
    const target =
      (b.getAttribute("onclick") || "").match(/navigate\('\/[a-z]+\/([a-z-]+)/)?.[1] ||
      (b.getAttribute("href") || "").split("/")[2];
    const a = TM_NAV[state.user.role]?.[target];
    if (a && tmLevel(a) === "none") b.hidden = true;
  }
  if (tmLevel("projects") !== "full")
    document.querySelectorAll('.dashboard-content [onclick*="/projects/new"]').forEach((b) => {
      b.hidden = true;
    });
}

const tmBaseRoute = window.route;
window.route = async function () {
  const parts = location.hash.replace(/^#/, "").split("?")[0].split("/").filter(Boolean),
    role = state.user?.role;
  if (state.user?.isMember && parts[0] === role) {
    const area = TM_NAV[role]?.[parts[1]];
    if (
      parts[1] === "team" ||
      (area && tmLevel(area) === "none") ||
      (area && parts[2] === "new" && tmLevel(area) !== "full")
    ) {
      toast("Your team role has no access to this area", "error");
      navigate(`/${role}/dashboard`);
      return;
    }
  }
  if (tmIsOwner() && parts[0] === role && parts[1] === "team") {
    try {
      await tmPage();
    } catch (e) {
      console.error(e);
      toast(e.message, "error");
    }
    return;
  }
  const result = await tmBaseRoute();
  tmViewHint(parts);
  return result;
};

