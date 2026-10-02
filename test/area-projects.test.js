// T128a: the customer's project list, "Create new project" and the supplier's "Assigned work" render from
// translation keys with data-action handlers; names, descriptions and statuses keep the old translation.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (f) => readFileSync(path.join(__dirname, "..", "public", f), "utf8");

const PROJECTS = [
  {
    id: "p1",
    name: "Line 4",
    description: "Robot cell",
    status: "In Progress",
    dueDate: "2026-10-29",
    phases: [
      {
        id: "ph1",
        name: "Build & integration",
        supplierId: "s1",
        acceptanceStatus: "Pending",
        startDate: "2026-10-01",
        dueDate: "2026-10-20",
        tasks: [
          { id: "t1", name: "PLC", status: "In Progress", progress: 40, startDate: "2026-10-01", dueDate: "2026-10-09", assignedSupplierId: "s1", acceptanceStatus: "Accepted" },
          { id: "t2", name: "Weld test", status: "Not Started", startDate: "2026-10-05", dueDate: "2026-10-12", orderAmount: 1000, assignedSupplierId: "s1", acceptanceStatus: "Pending", assignmentHistory: [{ status: "Invited", at: "2026-10-02" }] },
        ],
      },
    ],
  },
];

function area(lang, role, hash) {
  const warnings = [],
    calls = [],
    navigations = [];
  const ctx = {
    console: { warn: (...a) => warnings.push(a.join(" ")), error() {}, log() {} },
    localStorage: { getItem: (k) => (k === "cc_lang" ? lang : null) },
    navigator: { language: "en-GB" },
    document: { addEventListener() {}, getElementById: (id) => ctx.elements[id] },
    elements: {},
    location: { hash },
    Intl,
    URLSearchParams,
    FormData: class {
      constructor(form) {
        this.entries = Object.entries(form.values);
      }
      [Symbol.iterator]() {
        return this.entries[Symbol.iterator]();
      }
    },
    app: { innerHTML: "" },
    state: { user: { role, name: "Maya", supplierId: "s1" } },
    route: async () => {},
    topActions() {},
    navigate: (to) => navigations.push(to),
    toast() {},
    toastEl: { dataset: {} },
    dashboardShell: (r, active, html) => `[${r}:${active}]${html}`,
    esc: (s) => String(s ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]),
    pct: () => 33,
    pdProgress: (...a) => calls.push(["progress", ...a]),
    api: async (p, opts) => {
      calls.push(["api", p, opts?.body]);
      if (p.startsWith("/projects") && !opts) return { projects: PROJECTS };
      if (p === "/projects") return { project: { id: "p9" } };
      return {};
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ["locales/en.js", "locales/de.js", "core/t.js", "core/actions.js", "core/router.js", "areas/projects.js"])
    vm.runInContext(read(f), ctx, { filename: f });
  Object.assign(ctx, { warnings, calls, navigations });
  ctx.render = async () => (await ctx.route(), ctx.app.innerHTML);
  ctx.run = (name, el, event = { type: "click" }) => vm.runInContext("actions", ctx).run(name, el, event);
  return ctx;
}
const text = (html) => html.replace(/<[^>]*>/g, " ");

describe("projects area (T128a)", () => {
  for (const lang of ["en", "de"])
    for (const [role, hash] of [["customer", "#/customer/projects"], ["customer", "#/customer/projects/new"], ["supplier", "#/supplier/projects"], ["supplier", "#/supplier/phases"]])
      it(`draws ${hash} in ${lang === "en" ? "English" : "German"} from keys`, async () => {
        const ctx = area(lang, role, hash),
          html = await ctx.render();
        assert.deepEqual(ctx.warnings, []);
        assert.doesNotMatch(text(html), /\bprojects\.[a-zA-Z.]+/, "raw key");
        assert.doesNotMatch(html, /\son[a-z]+="/, "no inline handlers");
        assert.match(html, /^\[[a-z]+:[a-z]+\]<div (data-i18n="keys" class="dash-top"|class="form-card pa-new-project" data-i18n="keys")>/);
        if (lang === "de") assert.ok(/Projekte|Neues Projekt anlegen|Zugewiesene Arbeit/.test(html));
      });

  it("lists the customer's projects as links, with archived ones on request", async () => {
    const ctx = area("en", "customer", "#/customer/projects?archived=1"),
      html = await ctx.render();
    assert.ok(ctx.calls.some((c) => c[1] === "/projects?archived=1"));
    assert.ok(html.includes('<a class="cc-card click project-card" href="#/customer/projects/p1">'));
    assert.ok(html.includes('<span class="status in-progress" data-i18n="dom">In Progress</span>'));
    assert.ok(html.includes("33% complete") && html.includes("Due 29 Oct 2026"));
    assert.match(html, /data-action="projects\.archived" checked>/);
    ctx.run("projects.archived", { checked: false });
    assert.deepEqual(ctx.navigations, ["/customer/projects"]);
  });

  it("creates a project from a template, with phase and task names saved in English", async () => {
    const ctx = area("de", "customer", "#/customer/projects/new"),
      html = await ctx.render();
    assert.ok(html.includes('<option value="robotcell">Roboterzelle / Automatisierungszelle</option>'));
    assert.ok(html.includes('<b>1. <span data-i18n="dom">Design</span></b><small><span data-i18n="dom">Concept &amp; specification</span></small>'));
    ctx.elements.paTemplatePreview = { innerHTML: "" };
    ctx.run("projects.template", { value: "retrofit" }, { type: "change" });
    assert.match(ctx.elements.paTemplatePreview.innerHTML, /Retrofit execution/);
    ctx.elements.projectError = { textContent: "", innerHTML: "" };
    const form = { values: { name: "Cell", template: "blank", files: "" }, files: { files: [] }, querySelector: () => ({ disabled: false }) };
    await vm.runInContext("actions", ctx).run("projects.create", form, { type: "submit" });
    await new Promise((r) => setTimeout(r, 0));
    const post = ctx.calls.find((c) => c[1] === "/projects" && c[2]);
    assert.deepEqual(JSON.parse(JSON.stringify(post[2].phases)), [{ name: "Planning", description: "Planning work package", tasks: [] }]);
    assert.equal(post[2].files, undefined);
    assert.deepEqual(ctx.navigations, ["/customer/projects/p9"]);
  });

  it("shows the supplier invitations first, then the accepted work with its shortcuts", async () => {
    const ctx = area("en", "supplier", "#/supplier/projects?invite=t2"),
      html = await ctx.render();
    assert.ok(html.indexOf("Waiting for your answer") < html.indexOf("Accepted work"));
    assert.ok(html.includes('<article class="inv-card inv-highlight" id="inv-t2">'));
    assert.match(html, /data-action="dash\.answer" data-project="p1" data-task="t2" data-accept="true">Accept task</);
    assert.match(html, /data-action="dash\.answer" data-project="p1" data-phase="ph1" data-accept="false">Decline</);
    assert.ok(html.includes("Phase invitation · Line 4"));
    assert.ok(html.includes('href="#/supplier/projects/p1/documents?phase=ph1&amp;task=t1"'));
    assert.ok(html.includes('href="#/supplier/invoices?project=p1&amp;phase=ph1&amp;task=t1&amp;back=%2Fsupplier%2Fprojects%2Fp1"'));
    ctx.run("projects.progress", { dataset: { project: "p1", phase: "ph1", task: "t1", progress: "40" } });
    assert.deepEqual(ctx.calls.at(-1), ["progress", "p1", "ph1", "t1", 40]);
  });

  it("removed the old pages from every layer", () => {
    for (const f of ["app.js", "enhancements.js", "workflows.js", "reviews.js", "invitations.js", "platform-additions.js"])
      assert.doesNotMatch(read(f), /function customerProjects|function newProject|newProject = |function supplierPhases|supplierPhases = |customerProjectCard|PA_TEMPLATES|invWorkCard/, f);
    assert.ok(read("index.html").includes('<script src="areas/dashboards.js"></script><script src="areas/projects.js"></script>'));
  });
});
