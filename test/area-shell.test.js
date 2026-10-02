// T127a: the app shell (sidebar, phone bottom bar, bell, search, help row) is drawn in one place with translation
// keys: daily pages first and the rest under "More" (T93), the phone bar (T102), team members see only their areas.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (f) => readFileSync(path.join(__dirname, "..", "public", f), "utf8");

function shell(lang, user, hash = "#/customer/dashboard") {
  const warnings = [];
  const ctx = {
    console: { warn: (...a) => warnings.push(a.join(" ")), error() {}, log() {} },
    localStorage: { getItem: (k) => (k === "cc_lang" ? lang : null), setItem() {} },
    navigator: { language: "en-GB" },
    document: { addEventListener() {}, getElementById: () => ({}), querySelector: () => null },
    MutationObserver: class {
      observe() {}
    },
    addEventListener() {},
    location: { hash },
    Intl,
    URLSearchParams,
    state: { user },
    esc: (s) => String(s ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]),
    uiIcon: (name) => `<svg data-icon="${name}"></svg>`,
    UI_NAV_ICONS: {},
    uiUnread: 3,
    MNAV_MENU_ICON: "<svg/>",
    MNAV_MORE_ICON: "<svg/>",
    TM_NAV: { customer: { invoices: "invoices", messages: "messages", sourcing: "sourcing", time: "time", sites: "compliance", analytics: "analytics", contracts: "sourcing", offers: "sourcing", projects: "projects" }, supplier: {} },
    tmLevel: (area) => (user?.isMember ? user.permissions?.[area] || "none" : "full"),
    api: async () => ({}),
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ["locales/en.js", "locales/de.js", "core/t.js", "core/actions.js", "areas/shell.js"])
    vm.runInContext(read(f), ctx, { filename: f });
  ctx.warnings = warnings;
  ctx.render = (role, active) => vm.runInContext(`dashboardShell(${JSON.stringify(role)}, ${JSON.stringify(active)}, "<p>page</p>")`, ctx);
  return ctx;
}
const navLabels = (html) =>
  [...html.split("<nav data-ds-role")[1].split("</nav>")[0].matchAll(/<a[^>]*>(?:<svg[^>]*><\/svg>)?([^<]+)<\/a>|data-title="More"[^>]*>([^<]+)</g)].map((m) => m[1] || `[${m[2]}]`);

describe("app shell", () => {
  it("shows the daily pages first and the rest under More, for each role (T93)", () => {
    const owner = (role) => ({ role, name: "Ann Example", company: "Example GmbH" });
    assert.deepEqual(navLabels(shell("en", owner("customer")).render("customer", "dashboard")), [
      "Today", "Projects", "Approvals", "Sourcing", "Invoices", "Messages", "[More]",
      "Analytics", "Contracts", "Sites &amp; safety", "Offers overview", "Find Suppliers", "Preferred suppliers", "Inbox", "Time approvals", "Team", "Profile / Settings",
    ]);
    assert.deepEqual(navLabels(shell("en", owner("supplier"), "#/supplier/dashboard").render("supplier", "dashboard")).slice(0, 7), ["Today", "Work", "Team planner", "Opportunities", "Invoices", "Compliance", "[More]"]);
    assert.deepEqual(navLabels(shell("en", { role: "admin", name: "Admin" }, "#/admin/dashboard").render("admin", "dashboard")), ["Today", "Vetting", "Users", "Payments", "Escalations", "Reports", "[More]", "Audit log", "Platform Management", "Profile changes", "Settings"]);
  });

  for (const lang of ["en", "de"])
    it(`draws every label in ${lang === "en" ? "English" : "German"} from keys, without a missing one`, () => {
      for (const role of ["customer", "supplier", "admin"]) {
        const ctx = shell(lang, { role, name: "Ann Example" }, `#/${role}/dashboard`),
          html = ctx.render(role, "dashboard");
        assert.match(html, /<aside class="sidebar" id="mnavSidebar" data-i18n="keys">/);
        assert.doesNotMatch(html.replace(/<[^>]*>/g, " "), /\bshell\.[a-zA-Z.]+/, `${role}: raw key`);
        assert.deepEqual(ctx.warnings, [], role);
        assert.doesNotMatch(html, /\son[a-z]+="/, "no inline handlers");
      }
      const de = shell("de", { role: "customer", name: "A" }).render("customer", "dashboard");
      if (lang === "de") {
        assert.ok(de.includes('aria-label="Benachrichtigungen, 3 ungelesen"'));
        assert.ok(de.includes('aria-label="Schnellnavigation"'));
      }
    });

  it("draws the phone bottom bar with four pages and More (T102)", () => {
    const bar = (role) =>
      [...shell("en", { role, name: "A" }, `#/${role}/dashboard`).render(role, "dashboard").split('class="mnav-bottom"')[1].matchAll(/<span>([^<]+)<\/span>/g)].map((m) => m[1]);
    assert.deepEqual(bar("customer"), ["Today", "Projects", "Approvals", "Messages", "More"]);
    assert.deepEqual(bar("supplier"), ["Today", "Jobs", "Time", "Messages", "More"]);
    assert.deepEqual(bar("admin"), ["Today", "Vetting", "Payments", "Escalations", "More"]);
  });

  it("marks the current page, also inside a project and on pages without their own link", () => {
    const u = { role: "customer", name: "A" };
    assert.match(shell("en", u, "#/customer/projects/prj_1/tasks/t1").render("customer", "projects"), /<a class="active" aria-current="page" href="#\/customer\/projects"/);
    assert.match(shell("en", u, "#/customer/invoice/inv_1").render("customer", "invoices"), /<a class="active" aria-current="page" href="#\/customer\/invoices"/);
  });

  it("shows team members only their areas, with a Team badge and without Team or the checklist", () => {
    const member = { role: "customer", name: "Mia", isMember: true, permissions: { projects: "view", invoices: "full" } };
    const html = shell("en", member).render("customer", "dashboard"),
      labels = navLabels(html);
    for (const hidden of ["Sourcing", "Messages", "Team", "Analytics", "Contracts", "Time approvals"]) assert.ok(!labels.includes(hidden), hidden);
    for (const shown of ["Projects", "Invoices", "Profile / Settings"]) assert.ok(labels.includes(shown), shown);
    assert.ok(html.includes('<span class="tm-badge">Team</span>'));
    assert.match(html, /data-action="shell.checklist" hidden>/);
  });

  it("removed the old sidebar code from every add-on", () => {
    for (const f of ["app.js", "enhancements.js", "workflows.js"]) assert.doesNotMatch(read(f), /function sidebar\(|function dashboardShell\(/, f);
    for (const [f, gone] of [
      ["collaboration.js", /function ccNav|ccNav\(/],
      ["compliance-ui.js", /function cmNav|cmNav\(/],
      ["insights.js", /function inNav|inNav\(/],
      ["sourcing-ui.js", /function srNav|srNav\(/],
      ["planner.js", /function plNav|plNav\(/],
      ["team-ui.js", /function tmNav|tmCompleteNav/],
      ["platform-additions.js", /function paNav|paNav\(/],
      ["feedback-fixes.js", /ffFixSidebarState/],
      ["design-screens.js", /NG_GROUPS|DS_SIDE_LABELS|dsEnhanceSidebar|MNAV_BOTTOM/],
      ["ui-refresh.js", /uiEnhanceSidebar|uiSearchButton/],
      ["mobile-nav.js", /mnavEnhanceShell|MNAV_BOTTOM/],
    ])
      assert.doesNotMatch(read(f), gone, f);
    assert.ok(!read("index.html").includes('src="nav-groups.js"'));
  });
});
