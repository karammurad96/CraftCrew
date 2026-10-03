/* Area: team (T135b). The main account invites colleagues and decides per area whether they get no access,
   view-only or full access. Members see only the areas they may use; the server enforces every limit. Drawn with
   translation keys; names, emails and job titles are data. Area descriptions are keys per role. */
const teamk = (key, params) => esc(t("team." + key, params));
const TM_LEVELS = ["none", "view", "full"];
// Sidebar entry → access area. Entries not listed (dashboard, inbox, suppliers, profile) stay visible.
const TM_NAV = {
  customer: { projects: "projects", offers: "sourcing", bids: "sourcing", contracts: "sourcing", sourcing: "sourcing", invoices: "invoices", time: "time", sites: "compliance", messages: "messages", analytics: "analytics" },
  supplier: { phases: "projects", projects: "projects", planning: "projects", requests: "sourcing", bids: "sourcing", contracts: "sourcing", invoices: "invoices", time: "time", compliance: "compliance", messages: "messages", suppliers: "catalog", catalog: "catalog" },
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
const tmName = (k) => (typeof ccLookup("en", "team.area." + k) === "string" ? t("team.area." + k) : k);
const tmShort = (k) => esc(tmName(k));
// What an area covers, per role; an area the server adds later shows its English description
const tmAbout = (k, modules) => (typeof ccLookup("en", `team.about.${state.user.role}.${k}`) === "string" ? teamk(`about.${state.user.role}.${k}`) : esc(modules[k]));

Object.assign(UI_NAV_ICONS, { team: "users" });

/* Members: skip requests to areas without access and answer them with empty lists instead of errors. */
const tmBaseApi = api;
api = async function (path, opts = {}) {
  const [top, ...rest] = path.split("?")[0].split("/").filter(Boolean);
  if (state.user?.isMember && (!opts.method || opts.method === "GET") && !rest.length && TM_API[top] && tmLevel(TM_API[top]) === "none")
    return new Proxy({}, { get: (t, k) => (k === "then" || typeof k === "symbol" ? undefined : []) });
  return tmBaseApi(path, opts);
};

/* ---------- Team page (main account) ---------- */
async function tmPage() {
  const { modules, members } = await api("/team"),
    active = members.filter((m) => m.status !== "Suspended"),
    removed = members.filter((m) => m.status === "Suspended"),
    role = state.user.role,
    keys = Object.keys(modules),
    kpi = (label, value, sub, tone) => inKpi(teamk(label), value, teamk(sub), tone);
  const row = (m) =>
    `<tr><td><b>${esc(m.name)}</b><small>${esc(m.email)}${m.jobTitle ? " · " + esc(m.jobTitle) : ""}</small><small>${
      m.invitePending ? `<span class="status pending">${teamk("invited")}</span>` : teamk("lastSignIn", { when: m.lastLoginAt ? paTime(m.lastLoginAt) : "—" })
    }</small></td>${keys
      .map(
        (k) =>
          `<td><select class="tm-level tm-${esc(m.permissions[k] || "none")}" aria-label="${teamk("levelFor", { area: tmName(k), name: m.name })}" data-action="team.level" data-id="${esc(m.id)}" data-area="${esc(k)}">${TM_LEVELS.map(
            (v) => `<option value="${v}" ${m.permissions[k] === v ? "selected" : ""}>${teamk("level." + v)}</option>`,
          ).join("")}</select></td>`,
      )
      .join("")}<td class="actions"><div class="cc-actions"><button class="btn small outline" data-action="team.edit" data-id="${esc(m.id)}">${teamk("edit")}</button><button class="btn small outline danger-text" data-action="team.remove" data-id="${esc(
      m.id,
    )}">${teamk("remove")}</button></div></td></tr>`;
  app.innerHTML = dashboardShell(
    role,
    "team",
    [
      `<div class="dash-top"><div><div class="eyebrow">${teamk("eyebrow")}</div><h1>${teamk("title")}</h1><p>${teamk("lead")}</p></div><button class="btn primary" data-action="team.invite">${teamk("invite")}</button></div>`,
      `<div class="in-kpis">${kpi("kpi.members", active.length, "kpi.membersSub")}${kpi("kpi.open", active.filter((m) => m.invitePending).length, "kpi.openSub", active.some((m) => m.invitePending) ? "warn" : "good")}${kpi(
        "kpi.full",
        active.filter((m) => keys.every((k) => m.permissions[k] === "full")).length,
        "kpi.fullSub",
      )}${kpi("kpi.removed", removed.length, "kpi.removedSub")}</div>`,
      active.length
        ? `<section class="panel"><div class="panel-title"><h3>${teamk("members")}</h3><span class="ui-count">${active.length}</span></div><div class="table-wrap tm-table-wrap"><table class="tm-table"><thead><tr><th>${teamk("member")}</th>${keys
            .map((k) => `<th title="${tmAbout(k, modules)}">${tmShort(k)}</th>`)
            .join("")}<th class="actions">${teamk("actions")}</th></tr></thead><tbody>${active.map(row).join("")}</tbody></table></div></section>`
        : `<section class="panel cm-empty">${uiIcon("users", "ui-icon cm-empty-icon")}<h3>${teamk("emptyTitle")}</h3><p>${teamk("emptyText")}</p><button class="btn primary" data-action="team.invite">${teamk("invite")}</button></section>`,
      `<section class="panel"><div class="panel-title"><h3>${teamk("legendTitle")}</h3></div><div class="tm-legend">${TM_LEVELS.map(
        (v) => `<div><span class="tm-dot tm-${v}"></span><b>${teamk("level." + v)}</b><small>${teamk("levelText." + v)}</small></div>`,
      ).join("")}</div><div class="tm-areas">${keys.map((k) => `<div><b>${tmShort(k)}</b><small>${tmAbout(k, modules)}</small></div>`).join("")}</div></section>`,
      removed.length
        ? `<details class="panel"><summary><h3>${teamk("removed", { n: removed.length })}</h3></summary>${removed
            .map((m) => `<div class="pa-row"><span><b>${esc(m.name)}</b><small>${esc(m.email)}</small></span><button class="btn small outline" data-action="team.restore" data-id="${esc(m.id)}">${teamk("restore")}</button></div>`)
            .join("")}</details>`
        : "",
    ]
      .filter(Boolean)
      .join(""),
  );
}

/* ---------- Invite and edit ---------- */
let tmEditing = null; // the member being edited, or null for an invitation
async function tmForm(member) {
  const { modules } = await api("/team"),
    keys = Object.keys(modules),
    f = (key, params) => teamk("form." + key, params);
  tmEditing = member || null;
  const perms = member?.permissions || Object.fromEntries(keys.map((k) => [k, k === "settings" ? "none" : k === "messages" ? "full" : "view"]));
  modal(
    member ? t("team.form.editTitle", { name: member.name }) : t("team.form.inviteTitle"),
    `<form id="tmForm" class="modal-form" data-action="team.save" data-keys="${esc(keys.join(","))}"><div class="two"><label>${f("name")}<input name="name" required value="${esc(member?.name || "")}" autocomplete="off"></label><label>${f(
      "email",
    )}<input name="email" type="email" required value="${esc(member?.email || "")}" ${member ? "disabled" : ""} autocomplete="off"></label></div><label>${f("jobTitle")} <small class="subtle">${f("optional")}</small><input name="jobTitle" value="${esc(
      member?.jobTitle || "",
    )}" placeholder="${f("jobHint")}"></label><fieldset class="cm-fieldset"><legend>${f("access")}</legend><div class="tm-presets"><span class="subtle">${f("setAll")}</span>${TM_LEVELS.map(
      (v) => `<button type="button" class="btn small outline" data-action="team.preset" data-level="${v}">${teamk("level." + v)}</button>`,
    ).join("")}</div><div class="tm-matrix">${keys
      .map(
        (k) =>
          `<div class="tm-row"><div><b>${tmShort(k)}</b><small>${tmAbout(k, modules)}</small></div><div class="tm-seg" role="radiogroup" aria-label="${tmAbout(k, modules)}">${TM_LEVELS.map(
            (v) => `<label class="tm-seg-opt tm-${v}"><input type="radio" name="p_${k}" value="${v}" ${perms[k] === v ? "checked" : ""}><span>${teamk("level." + v)}</span></label>`,
          ).join("")}</div></div>`,
      )
      .join("")}</div></fieldset><div id="tmError" class="form-error"></div><button class="btn primary">${f(member ? "save" : "send")}</button></form>`,
  );
}
actions.on("team.invite", () => tmForm(null));
actions.on("team.edit", async (el) => {
  const m = (await api("/team")).members.find((x) => x.id === el.dataset.id);
  if (m) tmForm(m);
});
actions.on("team.preset", (el) => document.querySelectorAll(`#tmForm input[type=radio][value="${el.dataset.level}"]`).forEach((r) => (r.checked = true)));
actions.on("team.save", async (form) => {
  const f = new FormData(form),
    keys = form.dataset.keys.split(","),
    member = tmEditing,
    b = { name: f.get("name"), jobTitle: f.get("jobTitle"), permissions: Object.fromEntries(keys.map((k) => [k, f.get("p_" + k) || "none"])) };
  if (!member) b.email = f.get("email");
  try {
    if (member) {
      await api(`/team/${encodeURIComponent(member.id)}`, { method: "PATCH", body: b });
      closeModal();
      tToast(t("team.updated"));
      return route();
    }
    const r = await api("/team", { method: "POST", body: b });
    if (r.emailed) {
      closeModal();
      tToast(t("team.sent", { email: r.member.email }));
      return route();
    }
    const c = (key, params) => teamk("cred." + key, params);
    modal(
      t("team.cred.title"),
      `<div class="modal-form"><p>${c("lead", { name: r.member.name })}</p><div class="tm-cred"><div><span class="cc-label">${c("email")}</span><b>${esc(r.member.email)}</b></div><div><span class="cc-label">${c(
        "password",
      )}</span><code id="tmTemp">${esc(r.temporaryPassword)}</code></div></div><div class="cc-actions"><button type="button" class="btn outline" data-action="team.copy">${c("copy")}</button><button type="button" class="btn primary" data-action="team.done">${c(
        "done",
      )}</button></div></div>`,
    );
  } catch (x) {
    document.getElementById("tmError").textContent = x.message;
  }
});
actions.on("team.copy", () => navigator.clipboard?.writeText(document.getElementById("tmTemp").textContent).then(() => tToast(t("team.cred.copied"))));
actions.on("team.done", () => {
  closeModal();
  route();
});
actions.on("team.level", async (select) => {
  const m = (await api("/team")).members.find((x) => x.id === select.dataset.id);
  if (!m) return;
  try {
    await api(`/team/${encodeURIComponent(m.id)}`, { method: "PATCH", body: { permissions: { ...m.permissions, [select.dataset.area]: select.value } } });
    select.className = `tm-level tm-${select.value}`;
    tToast(t("team.updated"));
  } catch (x) {
    toast(x.message, "error");
    route();
  }
});
actions.on("team.remove", async (el) => {
  if (!(await uiConfirm(t("team.removeConfirm"), { confirmLabel: t("team.remove"), danger: true }))) return;
  try {
    await api(`/team/${encodeURIComponent(el.dataset.id)}`, { method: "DELETE" });
    tToast(t("team.removedToast"));
    route();
  } catch (x) {
    toast(x.message, "error");
  }
});
actions.on("team.restore", async (el) => {
  try {
    await api(`/team/${encodeURIComponent(el.dataset.id)}`, { method: "PATCH", body: { status: "Active" } });
    tToast(t("team.restored"));
    route();
  } catch (x) {
    toast(x.message, "error");
  }
});

/* ---------- Members: guard the routes and hint at view-only areas ---------- */
function tmViewHint(parts) {
  if (!state.user?.isMember) return;
  const area = TM_NAV[state.user.role]?.[parts[1]],
    top = document.querySelector(".dashboard-content .dash-top");
  if (area && tmLevel(area) === "view" && top && !document.querySelector(".tm-view-hint")) {
    top.insertAdjacentHTML("afterend", `<div class="notice tm-view-hint">${teamk("viewOnly")}</div>`);
    // The page's main create action would only be refused.
    top.querySelectorAll(".btn.primary").forEach((b) => (b.hidden = true));
  }
  // Shortcuts into areas without access lead nowhere, so hide them.
  for (const b of document.querySelectorAll('.dashboard-content a.btn[href^="#/"]')) {
    const a = TM_NAV[state.user.role]?.[(b.getAttribute("href") || "").split("/")[2]];
    if (a && tmLevel(a) === "none") b.hidden = true;
  }
  if (tmLevel("projects") !== "full") document.querySelectorAll('.dashboard-content [href$="/projects/new"]').forEach((b) => (b.hidden = true));
}
const tmBaseRoute = window.route;
window.route = async function () {
  const parts = location.hash.replace(/^#/, "").split("?")[0].split("/").filter(Boolean),
    role = state.user?.role;
  if (state.user?.isMember && parts[0] === role) {
    const area = TM_NAV[role]?.[parts[1]];
    if (parts[1] === "team" || (area && tmLevel(area) === "none") || (area && parts[2] === "new" && tmLevel(area) !== "full")) {
      tToast(t("team.noAccess"), "error");
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
