/* "Needs your attention" first: every dashboard opens with an action queue from GET /api/action-queue. Each item
   links to the page that resolves it. With nothing to do it says so and shows the next upcoming deadline. */
const aqEsc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

function aqHtml(d) {
  const items = d.items || [];
  if (!items.length) {
    const n = d.nextDeadline;
    return `<section class="panel aq-panel aq-empty" aria-labelledby="aqTitle"><div class="aq-head"><h2 id="aqTitle">You're all caught up</h2></div><p class="aq-calm">${
      n
        ? `Next deadline: <a href="#${aqEsc(n.link)}"><b>${aqEsc(n.name)}</b></a> · ${aqEsc(n.project)} · ${date(n.dueDate)}`
        : "Nothing needs your attention right now."
    }</p></section>`;
  }
  const more = (d.total || items.length) - items.length;
  return `<section class="panel aq-panel" aria-labelledby="aqTitle"><div class="aq-head"><h2 id="aqTitle">Action queue</h2><span class="ui-count">${d.total || items.length}</span></div><ul class="aq-list">${items
    .map(
      (x) =>
        `<li class="aq-item aq-${aqEsc(x.kind)}"><div><b>${aqEsc(x.text)}</b>${x.sub || x.amount ? `<small>${aqEsc(x.sub)}${x.sub && x.amount ? " · " : ""}${x.amount ? money(x.amount) : ""}</small>` : ""}</div><a class="btn small primary" href="#${aqEsc(x.link)}">${aqEsc(x.action || "Open")}</a></li>`,
    )
    .join("")}</ul>${more > 0 ? `<p class="aq-more">+ ${more} more</p>` : ""}</section>`;
}

let aqRendering = null;
async function aqRender() {
  const content = document.querySelector(".dashboard-content"),
    path = location.hash.split("?")[0];
  if (!content || !state.token || !/^#\/(customer|supplier|admin)\/dashboard$/.test(path)) return;
  const top = content.querySelector(".dash-top");
  let panel = content.querySelector(".aq-panel");
  // Keep the queue directly under the page header, above the checklist and the other panels.
  if (panel) {
    if (top && top.nextElementSibling !== panel) top.after(panel);
    return;
  }
  if (aqRendering === content) return;
  aqRendering = content;
  try {
    const d = await api("/action-queue");
    if (!document.contains(content) || content.querySelector(".aq-panel")) return;
    const box = document.createElement("div");
    box.innerHTML = aqHtml(d);
    panel = box.firstElementChild;
    top ? top.after(panel) : content.prepend(panel);
  } catch (e) {
    console.error(e);
  } finally {
    aqRendering = null;
  }
}
let aqQueued = false;
new MutationObserver(() => {
  if (aqQueued) return;
  aqQueued = true;
  requestAnimationFrame(() => {
    aqQueued = false;
    aqRender();
  });
}).observe(document.getElementById("app"), { childList: true, subtree: true });
