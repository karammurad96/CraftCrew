// T135c: the supplier's team planner and the customer's and supplier's analytics render from translation keys
// with data-action handlers.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (f) => readFileSync(path.join(__dirname, "..", "public", f), "utf8");
const today = new Date().toISOString().slice(0, 10);
const PLANNING = {
  people: [{ id: "w1", name: "Marta Keller", role: "Welder", kind: "worker" }],
  entries: [{ id: "e1", personId: "w1", type: "vacation", title: "Summer", start: today, end: today, conflict: true }],
  visits: [{ id: "v1", personId: "w1", type: "visit", title: "Plant", start: today, end: today, readOnly: true }],
  jobs: [{ taskId: "t1", taskName: "PLC", projectName: "Line 4", phaseName: "Build" }],
  types: { assignment: "Job", vacation: "Vacation", newType: "Something new" },
};

function area(lang, role) {
  const warnings = [],
    calls = [],
    toasts = [],
    shown = [];
  const ctx = {
    console: { warn: (...a) => warnings.push(a.join(" ")), error() {}, log() {} },
    localStorage: { getItem: (k) => (k === "cc_lang" ? lang : null), setItem() {} },
    navigator: { language: "en-GB" },
    document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, documentElement: { lang } },
    location: { hash: "" },
    Intl,
    URLSearchParams,
    app: { innerHTML: "" },
    state: { user: { role, supplierId: "s1" } },
    navigate: (to) => calls.push(["navigate", to]),
    toast: (m, type) => toasts.push([m, type]),
    toastEl: { dataset: {} },
    modal: (title, body) => shown.push({ title, body }),
    closeModal() {},
    dashboardShell: (r, active, html) => `[${r}:${active}]${html}`,
    uiIcon: () => "",
    UI_ICON_PATHS: {},
    UI_NAV_ICONS: {},
    srScorecardPanel: async () => calls.push(["scorecard"]),
    invNo: (i) => i.number,
    routes: { add: (p) => calls.push(["routes", p]) },
    esc: (s) => String(s ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]),
    api: async (p) => {
      calls.push(["api", p]);
      if (p.startsWith("/planning")) return JSON.parse(JSON.stringify(PLANNING));
      if (p === "/projects") return { projects: [{ id: "p1", name: "Line 4", budget: 9000, phases: [{ id: "ph1", name: "Build", tasks: [{ id: "t1", name: "PLC", status: "In Progress", dueDate: "2020-01-01", assignedSupplierId: "s1", acceptanceStatus: "Accepted", orderAmount: 1000 }] }] }] };
      if (p === "/invoices") return { invoices: [{ id: "i1", number: "2026-1", projectId: "p1", status: "Paid", amount: 500, supplierCompany: "Keller", customerCompany: "Makberg", createdAt: today }] };
      if (p === "/bids") return { bids: [{ title: "Vision", offers: [{ supplierId: "s1", status: "Not selected", amount: 900, deliveryDays: 1 }] }] };
      if (p === "/time-entries") return { entries: [] };
      return {};
    },
  };
  ctx.route = async () => calls.push(["route"]);
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ["core/languages.js", "locales/en.js", "locales/de.js", "core/t.js", "core/actions.js", "insights.js", "areas/planner.js", "areas/analytics.js"]) vm.runInContext(read(f), ctx, { filename: f });
  Object.assign(ctx, { warnings, calls, toasts, shown });
  ctx.run = (name, el) => vm.runInContext("actions", ctx).run(name, el, { type: "click", preventDefault() {} });
  return ctx;
}
const text = (html) => html.replace(/<[^>]*>/g, " ");
const clean = (ctx, html) => {
  assert.deepEqual(ctx.warnings, []);
  assert.doesNotMatch(text(html), /\b(pl|an)\.[a-zA-Z.]+/, "raw key");
  assert.doesNotMatch(html, /\son[a-z]+="/, "no inline handlers");
  assert.doesNotMatch(html, /data-i18n/); // no markers of the old translation layer (T136)
};

describe("team planner and analytics (T135c)", () => {
  it("moves one week per arrow click in every view (T145)", async () => {
    const ctx = area("en", "supplier");
    await vm.runInContext("plPage()", ctx);
    for (const span of ["week", "twoweeks", "month"]) {
      vm.runInContext(`pl.span = "${span}"`, ctx);
      const before = vm.runInContext("pl.start", ctx);
      ctx.run("pl.shift", { dataset: { dir: "1" } });
      assert.equal(vm.runInContext(`plDiff("${before}", pl.start)`, ctx), 7, span);
      ctx.run("pl.shift", { dataset: { dir: "-1" } });
      assert.equal(vm.runInContext("pl.start", ctx), before);
    }
  });

  it("has no dark-mode colours: the app is light only (T145)", () => {
    const fs = require("node:fs"),
      dir = path.join(__dirname, "..", "public");
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".css"))) assert.doesNotMatch(fs.readFileSync(path.join(dir, f), "utf8"), /prefers-color-scheme:\s*dark/, f);
  });

  for (const lang of ["en", "de"]) {
    const de = lang === "de";
    it(`draws the planner and its dialogs in ${de ? "German" : "English"} from keys`, async () => {
      const ctx = area(lang, "supplier");
      await vm.runInContext("plPage()", ctx);
      const html = ctx.app.innerHTML;
      clean(ctx, html);
      // T145: double-click plans or edits (bound on the track), Enter edits a focused bar, arrows move a week
      assert.match(html, /data-date="\d{4}-\d\d-\d\d" data-person="w1"><\/div>/);
      assert.match(html, /draggable="true" tabindex="0" data-entry="e1" data-key="pl\.edit" data-key-on="Enter"/);
      assert.match(html, /<p class="pl-hint">/);
      assert.match(html, /class="pl-bar pl-visit[^"]*ro" [^>]*data-action="pl\.visit"/);
      assert.match(html, /data-action="pl\.span" data-span="month"/);
      assert.ok(html.includes(de ? "1 Monteur" : "1 field worker") && html.includes(de ? "1 Doppelbuchung" : "1 double booking"));
      ctx.run("pl.new", { dataset: { person: "w1", date: today } });
      ctx.run("pl.planJob", { dataset: { task: "t1" } });
      for (const { body } of ctx.shown) clean(ctx, body);
      assert.ok(ctx.shown[0].body.includes('<option value="newType" >Something new</option>'), "an unknown type keeps its server label");
      assert.match(ctx.shown[0].body, /<select name="type" data-action="pl\.type">/);
    });

    it(`draws both analytics pages in ${de ? "German" : "English"} from keys`, async () => {
      const ctx = area(lang, "customer");
      await vm.runInContext("inCustomerAnalytics()", ctx);
      let html = ctx.app.innerHTML;
      clean(ctx, html);
      assert.match(html, /<select id="inProject" aria-label="[^"]+" data-action="an\.filter">/);
      assert.ok(html.includes(de ? "Überfällige Arbeiten" : "Overdue work"));
      ctx.state.user.role = "supplier";
      await vm.runInContext("inSupplierAnalytics()", ctx);
      html = ctx.app.innerHTML;
      clean(ctx, html);
      assert.ok(html.includes(de ? "Nicht ausgewählt" : "Not selected"));
      assert.ok(ctx.calls.some((c) => c[0] === "scorecard"));
    });
  }

  it("filters analytics through the address", () => {
    const ctx = area("en", "customer");
    vm.runInContext('document.getElementById = (id) => ({ inProject: { value: "p1" }, inPeriod: { value: "12" } })[id]', ctx);
    ctx.run("an.filter", {});
    assert.deepEqual(ctx.calls.find((c) => c[0] === "navigate"), ["navigate", "/customer/analytics?project=p1&period=12"]);
  });

  it("replaced planner.js and the analytics pages in insights.js", () => {
    assert.ok(!existsSync(path.join(__dirname, "..", "public", "planner.js")));
    assert.doesNotMatch(read("insights.js"), /inCustomerAnalytics|inSupplierAnalytics|window\.route/);
    assert.match(read("insights.js"), /function inTopN\(/, "the sourcing dashboard still uses it");
    assert.ok(read("index.html").includes('<script src="areas/team.js"></script><script src="areas/planner.js"></script><script src="areas/analytics.js"></script>'));
  });
});
