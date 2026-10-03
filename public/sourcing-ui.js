/* Strategic sourcing: shared constants and icons, and the scorecards on admin reports. The sourcing dashboard, the
   offer comparison and contracts are in areas/sourcing.js (T129c), the approvals inbox in areas/sites.js (T133). */
const SR_WEIGHTS = { price: 50, delivery: 20, quality: 20, experience: 10 };
const SR_ACTIVE = ["Open", "Shortlist", "Second round", "Final round"];
const srDays = (a, b) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 86400000));
const srToday = () => new Date().toISOString().slice(0, 10);

Object.assign(UI_ICON_PATHS, {
  sourcing: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  contracts:
    '<path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path d="M14 2v6h6"/><path d="m8 16 2 2 5-5"/>',
  approvals: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
});
Object.assign(UI_NAV_ICONS, { sourcing: "sourcing", contracts: "contracts", approvals: "approvals" });

/* ---------- Scorecards on admin reports (the supplier scorecard panel is in areas/directory.js) ---------- */
async function srAdminScorecards() {
  const content = document.querySelector(".dashboard-content");
  if (!content || content.querySelector(".sr-admin-cards")) return;
  const { scorecards = [] } = await api("/scorecards").catch(() => ({}));
  content.insertAdjacentHTML(
    "beforeend",
    `<section class="panel sr-admin-cards"><div class="panel-title"><h3>Supplier scorecards & risk</h3><span class="ui-count">${scorecards.length}</span></div>${srScorecardTable(scorecards)}</section>`,
  );
}

/* ---------- Navigation and routing ---------- */
const srBaseRoute = window.route;
window.route = async function () {
  const path = location.hash.replace(/^#/, "").split("?")[0],
    parts = path.split("/").filter(Boolean);
  const result = await srBaseRoute();
  try {
    if (parts[0] === "supplier" && parts[1] === "analytics" && state.user?.supplierId)
      await srScorecardPanel(state.user.supplierId, document.querySelector(".dashboard-content"));
    if (parts[0] === "admin" && parts[1] === "reports") await srAdminScorecards();
  } catch (e) {
    console.error(e);
  }
  return result;
};
