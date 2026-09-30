/* Sidebar groups and counts. Every page renders its own sidebar and add-ons insert more links into it, so this
   runs after each render: it sorts all links into named groups with a small heading each (links stay direct
   children of the nav, so the add-ons keep working) and shows count badges from GET /api/nav-counts.
   Links no group names land under "More". */
const NG_GROUPS = {
  customer: [
    ["Work", ["dashboard", "projects", "approvals", "time"]],
    ["Buying", ["suppliers", "offers", "sourcing", "contracts"]],
    ["Money", ["invoices", "analytics"]],
    ["Site safety", ["sites"]],
    ["Communication", ["inbox", "messages"]],
    ["Company", ["team", "profile"]],
  ],
  supplier: [
    ["Work", ["dashboard", "projects", "planning", "time"]],
    ["Sales", ["bids", "requests", "contracts", "suppliers"]],
    ["Money", ["invoices", "analytics"]],
    ["Site safety", ["compliance"]],
    ["Communication", ["inbox", "messages"]],
    ["Company", ["team", "profile"]],
  ],
  admin: [
    ["Overview", ["dashboard", "reports"]],
    ["Suppliers & users", ["applications", "users"]],
    ["Money", ["billing"]],
    ["Support", ["disputes"]],
    ["Platform", ["platform", "audit", "profile"]],
  ],
};
const ngKey = (a) => (a.getAttribute("href") || "").split("?")[0].split("/")[2] || "";

function ngGroup(nav, role) {
  const groups = NG_GROUPS[role];
  if (!groups) return;
  const children = [...nav.children],
    links = children.filter((el) => el.tagName === "A"),
    titles = new Map(
      children.filter((el) => el.classList.contains("ng-title")).map((el) => [el.dataset.title, el]),
    ),
    title = (name) => {
      let el = titles.get(name);
      if (!el) {
        el = document.createElement("div");
        el.className = "ng-title";
        el.dataset.title = name;
        el.textContent = name;
      }
      return el;
    },
    used = new Set(),
    order = [];
  for (const [name, keys] of groups) {
    const items = keys.flatMap((k) => links.filter((a) => ngKey(a) === k && !used.has(a)));
    if (!items.length) continue;
    order.push(title(name), ...items);
    items.forEach((a) => used.add(a));
  }
  const rest = children.filter((el) => !used.has(el) && !el.classList.contains("ng-title"));
  if (rest.length) order.push(title("More"), ...rest);
  // Only touch the DOM when the order changed, so this cannot loop with other observers.
  if (order.length === children.length && order.every((el, i) => el === children[i])) return;
  nav.replaceChildren(...order);
}

let ngCounts = null,
  ngCountsAt = 0,
  ngLoading = null;
async function ngLoadCounts() {
  if (ngLoading) return ngLoading;
  if (ngCounts && Date.now() - ngCountsAt < 20000) return ngCounts;
  ngLoading = api("/nav-counts")
    .then((d) => {
      ngCounts = d.counts || {};
      ngCountsAt = Date.now();
      return ngCounts;
    })
    .catch(() => ngCounts || {})
    .finally(() => (ngLoading = null));
  return ngLoading;
}
function ngShowCounts(nav, counts) {
  for (const a of nav.querySelectorAll(":scope > a")) {
    const n = Number(counts[ngKey(a)]) || 0;
    let badge = a.querySelector(".ng-count");
    if (!n) {
      badge?.remove();
      continue;
    }
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "ng-count";
      a.append(badge);
    }
    const text = n > 99 ? "99+" : String(n);
    if (badge.textContent !== text) badge.textContent = text;
    badge.setAttribute("aria-label", `${n} open`);
  }
}

let ngQueued = false;
function ngEnhance() {
  ngQueued = false;
  const nav = document.querySelector(".app-shell .sidebar nav"),
    role = state.user?.role;
  if (!nav || !role || !state.token) return;
  ngGroup(nav, role);
  ngLoadCounts().then((counts) => {
    const current = document.querySelector(".app-shell .sidebar nav");
    if (current) ngShowCounts(current, counts);
  });
}
new MutationObserver(() => {
  if (ngQueued) return;
  ngQueued = true;
  requestAnimationFrame(ngEnhance);
}).observe(document.getElementById("app"), { childList: true, subtree: true });
// Counts go stale when the user acts elsewhere; refresh them on the next page change.
window.addEventListener("hashchange", () => (ngCountsAt = 0));
ngEnhance();
