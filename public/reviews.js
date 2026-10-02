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
function reviewQuery() {
  return new URLSearchParams(location.hash.split("?")[1] || "");
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
