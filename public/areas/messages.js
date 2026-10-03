/* Area: messages and inbox (T132). Project chats (threads, search, compose, a new chat for a project, phase or
   task) and the inbox of notifications (search, read state, type, open, mark read). Drawn with translation keys;
   chat messages, names and notification texts are data. */
const mgk = (key, params) => esc(t("msg." + key, params));
const mgDom = (text) => `<bdi>${esc(text)}</bdi>`;
const mgQuery = () => new URLSearchParams(location.hash.split("?")[1] || "");

/* ---------- Chats ---------- */
let mgActive = null; // the open chat
async function messages(role) {
  const chats = (await api("/chats")).chats || [],
    q = mgQuery(),
    // From a project's Messages tab (?project=): open that project's conversation first (T109)
    active = chats.find((c) => c.id === q.get("chat")) || (q.get("project") && chats.find((c) => c.projectId === q.get("project"))) || chats[0],
    detail = active ? await api(`/chats/${active.id}/messages`) : null,
    search = q.get("search") || "",
    matches = chats.filter((c) => `${c.title} ${c.members?.map((x) => x.name).join(" ")} ${c.lastMessage?.text || ""}`.toLowerCase().includes(search.toLowerCase()));
  mgActive = active || null;
  const thread = (c) =>
    `<a class="cc-chat-thread ${c.id === active?.id ? "active" : ""}" href="#/${role}/messages?chat=${encodeURIComponent(c.id)}&search=${encodeURIComponent(search)}"><b>${esc(c.title)}</b><small>${
      c.members?.length ? esc(c.members.map((x) => x.name).join(", ")) : mgk("projectTeam")
    }</small><p>${c.lastMessage?.text ? esc(c.lastMessage.text) : mgk("noMessagesYet")}</p></a>`;
  const bubble = (m) =>
    `<article class="cc-chat-bubble ${m.senderId === state.user.id ? "mine" : ""}"><b>${
      m.senderId === state.user.id ? mgk("you") : (active.members?.find((x) => x.id === m.senderId)?.name && esc(active.members.find((x) => x.id === m.senderId).name)) || mgk("participant")
    }</b><p>${esc(m.text)}</p><small>${esc(fmt.date(m.createdAt))}</small></article>`;
  const main = active
    ? `<header class="cc-chat-header"><div><b>${esc(active.title)}</b><small>${esc([active.projectName, active.phaseName, active.taskName].filter(Boolean).join(" · "))} · ${(active.members || [])
        .map((x) => esc(x.name))
        .join(", ")}</small></div><a class="btn small outline" href="#/${role}/projects/${esc(active.projectId)}">${mgk("openProject")}</a></header><div class="cc-chat-messages" id="ccChatMessages">${
        (detail.messages || []).map(bubble).join("") || `<div class="empty">${mgk("emptyThread")}</div>`
      }</div><form id="ccChatCompose" class="cc-chat-compose" data-action="msg.send" data-chat="${esc(active.id)}"><textarea name="text" maxlength="5000" placeholder="${mgk("write")}" required></textarea><button class="btn primary">${mgk(
        "send",
      )}</button></form>`
    : `<div class="cc-chat-empty">${mgk("select")}</div>`;
  app.innerHTML = dashboardShell(
    role,
    "messages",
    [
      `<h1 class="sr-only">${mgk("title")}</h1>`,
      `<section class="cc-chat-workspace"><aside class="cc-chat-sidebar"><div class="cc-chat-sidebar-head"><b>${mgk("chats")} <span>${chats.length}</span></b><button class="btn small primary" data-action="msg.new">${mgk(
        "newChat",
      )}</button></div><input id="ccChatSearch" placeholder="${mgk("search")}" value="${esc(search)}" data-input="msg.search"><div class="cc-chat-threads">${matches.map(thread).join("") || `<div class="empty">${mgk("noMatch")}</div>`}</div></aside><section class="cc-chat-main">${main}</section></section>`,
    ]
      .join(""),
  );
  const box = document.getElementById("ccChatMessages");
  if (box) box.scrollTop = box.scrollHeight;
}
actions.on("msg.search", (input) => {
  const next = mgQuery();
  next.set("search", input.value);
  history.replaceState(null, "", `#/${state.user.role}/messages?${next}`);
  document.querySelectorAll(".cc-chat-thread").forEach((a) => (a.hidden = !a.textContent.toLowerCase().includes(input.value.toLowerCase())));
});
actions.on("msg.send", async (form) => {
  try {
    await api(`/chats/${encodeURIComponent(form.dataset.chat)}/messages`, { method: "POST", body: { text: new FormData(form).get("text") } });
    await route();
  } catch (x) {
    toast(x.message, "error");
  }
});

/* ---------- New chat ---------- */
async function reviewNewChat() {
  const [projects, { users: contacts = [] }] = await Promise.all([ccProjects(), api("/contacts")]),
    n = (key) => mgk("n." + key);
  if (!projects.length) return tToast(t("msg.n.needProject"), "error");
  const opt = (value, label) => `<option value="${esc(value)}">${label}</option>`;
  modal(
    t("msg.n.title"),
    `<form class="modal-form" id="ccNewChatForm" data-action="msg.create"><label>${n("project")}<select name="projectId" id="ccChatProject">${projects.map((p) => opt(p.id, esc(p.name))).join("")}</select></label><label>${n(
      "scope",
    )}<select name="scope" id="ccChatScope" data-action="msg.scope">${["project", "phase", "task"].map((s) => opt(s, n("scopes." + s))).join("")}</select></label><label id="ccChatPhaseWrap" hidden>${n("phase")}<select id="ccChatPhase">${projects
      .flatMap((p) => (p.phases || []).map((ph) => opt(`${p.id}|${ph.id}`, `${esc(p.name)} · ${esc(ph.name)}`)))
      .join("")}</select></label><label id="ccChatTaskWrap" hidden>${n("task")}<select id="ccChatTask">${projects
      .flatMap((p) => (p.phases || []).flatMap((ph) => (ph.tasks || []).map((x) => opt(`${p.id}|${ph.id}|${x.id}`, `${esc(p.name)} · ${esc(ph.name)} · ${esc(x.name)}`))))
      .join("")}</select></label><label>${n("name")}<input name="title" maxlength="120" placeholder="${n("nameHint")}"></label><label>${n("find")}<input id="ccContactSearch" placeholder="${n(
      "findHint",
    )}" data-input="msg.contacts"></label><div class="cc-contact-list">${contacts
      .map((u) => `<label class="cc-contact"><input type="checkbox" name="participantIds" value="${esc(u.id)}"><span><b>${esc(u.name)}</b><small>${u.company ? esc(u.company) : mgDom(u.role)}</small></span></label>`)
      .join("")}</div><div id="ccChatError" class="form-error"></div><button class="btn primary">${n("create")}</button></form>`,
  );
}
actions.on("msg.new", () => reviewNewChat());
actions.on("msg.scope", (sel) => {
  document.getElementById("ccChatPhaseWrap").hidden = sel.value !== "phase";
  document.getElementById("ccChatTaskWrap").hidden = sel.value !== "task";
});
actions.on("msg.contacts", (input) => document.querySelectorAll(".cc-contact").forEach((x) => (x.hidden = !x.textContent.toLowerCase().includes(input.value.toLowerCase()))));
actions.on("msg.create", async (form) => {
  const projectId = document.getElementById("ccChatProject").value,
    scope = document.getElementById("ccChatScope").value;
  let phaseId = "",
    taskId = "";
  if (scope === "phase") [, phaseId] = document.getElementById("ccChatPhase").value.split("|");
  if (scope === "task") [, phaseId, taskId] = document.getElementById("ccChatTask").value.split("|");
  const participantIds = [...form.querySelectorAll("[name=participantIds]:checked")].map((x) => x.value);
  try {
    const { chat } = await api("/chats", { method: "POST", body: { projectId, phaseId, taskId, participantIds, title: new FormData(form).get("title") } });
    closeModal();
    // Before, an undefined variable broke this step after the chat was created
    navigate(`/${state.user.role}/messages?chat=${encodeURIComponent(chat.id)}`);
  } catch (x) {
    document.getElementById("ccChatError").textContent = x.message;
  }
});

/* ---------- Inbox ---------- */
let mgNotes = []; // the notifications of the inbox on screen
const MG_TYPES = ["message", "invoice", "bid", "time", "document", "request"];
// The kind of a notification, from its (English) text
function mgKind(n) {
  const x = String(n.text || "").toLowerCase();
  return /message/.test(x) ? "message" : /invoice/.test(x) ? "invoice" : /bid|offer/.test(x) ? "bid" : /time|hour/.test(x) ? "time" : /document|approval/.test(x) ? "document" : /request|quote/.test(x) ? "request" : "other";
}
function ccNotificationLink(n, role) {
  if (n.link) return n.link;
  const x = String(n.text || "").toLowerCase();
  if (/time entry|\d+(?:\.\d+)?h time|submitted .*h/.test(x)) return role === "customer" ? "/customer/time" : "/supplier/time";
  if (/message|chat/.test(x)) return `/${role}/messages`;
  if (/invoice|payment/.test(x)) return `/${role}/invoices`;
  if (/bid|offer/.test(x)) return role === "supplier" ? "/supplier/bids" : "/customer/offers";
  if (/document|handover/.test(x)) return `/${role}/projects`;
  if (/request|quote/.test(x)) return role === "supplier" ? "/supplier/requests" : "/customer/offers";
  return `/${role}/inbox`;
}
function ccInboxRows(rows, role) {
  const i = (key) => mgk("in." + key);
  return rows.length
    ? `<div class="cc-inbox-list">${rows
        .map(
          (n) =>
            `<article class="cc-inbox-item ${n.read ? "" : "unread"}"><span class="cc-inbox-dot"></span><div><b>${mgDom(n.text)}</b><small>${esc(fmt.date(n.createdAt))}</small></div><div class="cc-actions"><button class="btn small primary" data-action="inbox.open" data-id="${esc(
              n.id,
            )}" data-link="${esc(ccNotificationLink(n, role))}">${i("open")}</button>${!n.read ? `<button class="btn small outline" data-action="inbox.read" data-id="${esc(n.id)}">${i("markRead")}</button>` : ""}</div></article>`,
        )
        .join("")}</div>`
    : `<div class="empty">${i("empty")}</div>`;
}
async function ccInbox(role) {
  const d = await api("/notifications"),
    i = (key, params) => mgk("in." + key, params);
  mgNotes = d.notifications || [];
  app.innerHTML = dashboardShell(
    role,
    "inbox",
    `<div class="cc-page cc-inbox"><div class="cc-inbox-toolbar"><div><div class="eyebrow">${i("eyebrow")}</div><h1>${i("title")}</h1><p>${i("intro")}</p></div><button class="btn outline" data-action="inbox.readAll">${i(
        "readAll",
      )}</button></div><section class="panel"><div class="cc-inbox-filters"><input id="ccInboxSearch" placeholder="${i("search")}" data-input="inbox.filter"><select id="ccInboxState" aria-label="${i(
        "stateLabel",
      )}" data-action="inbox.filter"><option value="all">${i("all", { n: mgNotes.length })}</option><option value="unread">${i("unread", { n: d.unread || 0 })}</option><option value="read">${i(
        "read",
      )}</option></select><select id="ccInboxType" aria-label="${i("typeLabel")}" data-action="inbox.filter">${["all", ...MG_TYPES].map((k) => `<option value="${k}">${i("types." + k)}</option>`).join("")}</select></div><div id="ccInboxRows">${ccInboxRows(
        mgNotes,
        role,
      )}</div></section></div>`,
  );
}
actions.on("inbox.filter", () => {
  const q = document.getElementById("ccInboxSearch").value.toLowerCase(),
    s = document.getElementById("ccInboxState").value,
    k = document.getElementById("ccInboxType").value;
  document.getElementById("ccInboxRows").innerHTML = ccInboxRows(
    mgNotes.filter((n) => (!q || n.text.toLowerCase().includes(q)) && (s === "all" || (s === "unread" ? !n.read : n.read)) && (k === "all" || mgKind(n) === k)),
    state.user.role,
  );
});
actions.on("inbox.open", async (el) => {
  await api("/notifications/" + encodeURIComponent(el.dataset.id), { method: "PATCH", body: { read: true } });
  navigate(el.dataset.link);
});
actions.on("inbox.read", async (el) => {
  await api("/notifications/" + encodeURIComponent(el.dataset.id), { method: "PATCH", body: { read: true } });
  await route();
});
actions.on("inbox.readAll", async () => {
  await api("/notifications/read-all", { method: "PATCH", body: {} });
  await route();
});

routes.add("/customer/messages", () => messages("customer"));
routes.add("/supplier/messages", () => messages("supplier"));
routes.add("/customer/inbox", () => ccInbox("customer"));
routes.add("/supplier/inbox", () => ccInbox("supplier"));
