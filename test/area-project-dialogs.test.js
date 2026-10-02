// T128d: the project dialogs are drawn from translation keys and submit through data-action. Status choices send
// the English value in every language (the old translation renamed the options, so saving in German failed).
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (f) => readFileSync(path.join(__dirname, "..", "public", f), "utf8");
const PROJECT = {
  id: "p1",
  name: "Line 4",
  description: "Robot cell",
  budget: 10000,
  startDate: "2026-09-01",
  dueDate: "2026-12-01",
  phases: [{ id: "ph1", name: "Build", status: "In Progress", dependencies: [], tasks: [{ id: "t1", name: "PLC", status: "In Progress", progress: 40, orderAmount: 1000 }, { id: "t2", name: "Free", status: "Not Started" }] }],
};

function area(lang, { confirm = true, typed = null, participants } = {}) {
  const warnings = [],
    calls = [],
    toasts = [],
    shown = [];
  const ctx = {
    console: { warn: (...a) => warnings.push(a.join(" ")), error() {}, log() {} },
    localStorage: { getItem: (k) => (k === "cc_lang" ? lang : null) },
    navigator: { language: "en-GB" },
    document: { addEventListener() {}, querySelector: () => null, getElementById: (id) => (ctx.elements[id] ||= { textContent: "" }) },
    elements: {},
    location: { hash: "#/customer/projects/p1" },
    Intl,
    URLSearchParams,
    FormData: class {
      constructor(form) {
        this.values = form.values;
      }
      get(k) {
        return this.values[k] ?? null;
      }
      has(k) {
        return k in this.values;
      }
      [Symbol.iterator]() {
        return Object.entries(this.values)[Symbol.iterator]();
      }
    },
    route: async () => calls.push(["route"]),
    navigate: (to) => calls.push(["navigate", to]),
    toast: (m, type) => toasts.push([m, type]),
    toastEl: { dataset: {} },
    modal: (title, body) => shown.push({ title, body }),
    closeModal: () => calls.push(["close"]),
    uiConfirm: async (message, opts) => (calls.push(["confirm", message, opts?.confirmLabel]), confirm),
    uiDialog: async (o) => (calls.push(["dialog", o.title, o.message]), typed),
    esc: (s) => String(s ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]),
    ccBadge: () => "Gold",
    api: async (p, opts) => {
      calls.push(["api", p, opts?.method || "GET", opts?.body]);
      if (p === "/projects/p1" && !opts) return { project: JSON.parse(JSON.stringify(PROJECT)), suppliers: [{ id: "s1", company: "Keller", rating: 4.8, hourlyRate: 95, projectRate: 2400, services: ["Welding"] }] };
      if (p === "/invoices") return { invoices: [] };
      if (p.endsWith("/documents")) return { documents: [] };
      if (p.endsWith("/participants") && !opts) return participants || { canManage: true, people: [{ id: "u1", name: "Ann Owner", email: "a@x.de", access: "owner" }, { id: "u2", name: "Ben", email: "b@x.de", access: "project" }] };
      if (p.endsWith("/participants")) return { person: { name: "Cleo", email: "c@x.de" }, temporaryPassword: "Xy7" };
      if (p === "/projects/p1" && opts?.method === "DELETE") return { archived: false };
      return {};
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ["locales/en.js", "locales/de.js", "core/t.js", "core/actions.js", "areas/project-dialogs.js"]) vm.runInContext(read(f), ctx, { filename: f });
  Object.assign(ctx, { warnings, calls, toasts, shown });
  ctx.run = (name, el) => vm.runInContext("actions", ctx).run(name, el, { type: "submit" });
  ctx.call = (code) => vm.runInContext(code, ctx);
  return ctx;
}
// actions.run does not return the handler's promise; let it finish
const settle = () => new Promise((r) => setTimeout(r, 5));
const form = (dataset, values) => ({ dataset, values, querySelector: () => ({ textContent: "" }), innerHTML: "" });
const text = (html) => html.replace(/<[^>]*>/g, " ");

describe("project dialogs (T128d)", () => {
  for (const lang of ["en", "de"])
    it(`draws every dialog in ${lang === "en" ? "English" : "German"} from keys`, async () => {
      const ctx = area(lang);
      for (const code of ["pdEditProject('p1')", "pdSupport('p1')", "pdAddPhase('p1')", "pdEditPhase('p1','ph1')", "pdAddTask('p1','ph1')", "pdEditTask('p1','ph1','t1')", "pdAssign('p1','t1')", "pdProgress('p1','ph1','t1',40)", "pdShare('p1')"])
        await ctx.call(code);
      assert.equal(ctx.shown.length, 9);
      for (const { title, body } of ctx.shown) {
        assert.doesNotMatch(title + text(body), /\bdlg\.[a-zA-Z.]+/, "raw key");
        assert.doesNotMatch(body, /\son[a-z]+="/, "no inline handlers");
        assert.match(body, /data-i18n="keys"/);
      }
      assert.deepEqual(ctx.warnings, []);
      if (lang === "de") {
        assert.deepEqual(ctx.shown.map((x) => x.title).slice(0, 3), ["Projekt bearbeiten", "Eskalieren / Support", "Projektphase hinzufügen"]);
        // German labels, English values
        assert.ok(ctx.shown[3].body.includes('<option value="In Progress" selected>In Bearbeitung</option>'));
        assert.ok(ctx.shown[7].body.includes('<option value="In Progress" selected>In Bearbeitung</option>'));
      }
    });

  it("saves a phase or task with its dependency, and a task edit with the English status", async () => {
    const ctx = area("de");
    await ctx.run("pd.addPhase", form({ project: "p1" }, { name: "FAT", dependency: "ph1", dueDate: "2026-11-01" }));
    await settle();
    await ctx.run("pd.editTask", form({ project: "p1", phase: "ph1", task: "t1" }, { name: "PLC", status: "In Progress", progress: "50" }));
    await settle();
    const writes = ctx.calls.filter((c) => c[0] === "api" && c[2] !== "GET");
    assert.deepEqual(JSON.parse(JSON.stringify(writes)), [
      ["api", "/projects/p1/phases", "POST", { name: "FAT", dueDate: "2026-11-01", dependencies: ["ph1"] }],
      ["api", "/projects/p1/phases/ph1/tasks/t1", "PATCH", { name: "PLC", status: "In Progress", progress: "50" }],
    ]);
    assert.equal(ctx.calls.filter((c) => c[0] === "route").length, 2, "the page is drawn again");
  });

  it("archives a project with records and deletes an empty one only after its name is typed", async () => {
    const empty = area("en", { typed: "Line 4" });
    await empty.call("pdDeleteProject('p1')");
    assert.ok(empty.calls.some((c) => c[0] === "dialog" && c[1] === "Delete project for good?"));
    assert.ok(empty.calls.some((c) => c[1] === "/projects/p1" && c[2] === "DELETE"));
    assert.deepEqual(empty.calls.at(-1), ["navigate", "/customer/projects"]);
    const wrong = area("en", { typed: "Line 5" });
    await wrong.call("pdDeleteProject('p1')");
    assert.ok(!wrong.calls.some((c) => c[2] === "DELETE"));
    assert.deepEqual(wrong.toasts.at(-1), ["The name does not match. Nothing was deleted.", "error"]);
  });

  it("refuses to delete a task that has a supplier", async () => {
    const ctx = area("en");
    const projectWithSupplier = JSON.parse(JSON.stringify(PROJECT));
    projectWithSupplier.phases[0].tasks[0].assignedSupplierId = "s1";
    const api = ctx.api;
    ctx.api = async (p, o) => (p === "/projects/p1" && !o ? { project: projectWithSupplier } : api(p, o));
    await vm.runInContext("actions", ctx).run("pd.deleteTask", { dataset: { project: "p1", phase: "ph1", task: "t1" } }, { type: "click" });
    await settle();
    assert.ok(ctx.calls.some((c) => c[0] === "dialog" && c[1] === "This task cannot be deleted"));
    assert.ok(!ctx.calls.some((c) => c[2] === "DELETE"));
  });

  it("shares a project, shows the temporary password and removes access (T110)", async () => {
    const ctx = area("en");
    await ctx.call("pdShare('p1')");
    const body = ctx.shown[0].body;
    assert.ok(body.includes('data-action="pd.share" data-project="p1"'));
    assert.match(body, /data-action="pd\.unshare" data-project="p1" data-user="u2" aria-label="Remove access for Ben">Remove</);
    assert.doesNotMatch(body, /data-user="u1"/, "the owner cannot be removed");
    await ctx.run("pd.share", form({ project: "p1" }, { name: "Cleo", email: "c@x.de" }));
    await settle();
    assert.ok(ctx.shown.at(-1).body.includes("Cleo can sign in with the temporary password Xy7 and will choose a new one."));
    const viewer = area("de", { participants: { canManage: false, people: [] } });
    await viewer.call("pdShare('p1')");
    assert.ok(viewer.shown[0].body.includes("Nur der Projektinhaber kann Kolleginnen und Kollegen einladen."));
  });

  it("invites a supplier, withdraws an invitation and closes a project with reviews", async () => {
    const ctx = area("en");
    await ctx.call("pdAssign('p1','t2')");
    assert.match(ctx.shown[0].body, /The supplier receives an invitation/);
    assert.match(ctx.shown[0].body, /€95\/hour · €2,400 starting/);
    await vm.runInContext("actions", ctx).run("pd.invite", { dataset: { project: "p1", task: "t2", supplier: "s1" } }, { type: "click" });
    await settle();
    assert.ok(ctx.calls.some((c) => c[1] === "/projects/p1/tasks/t2/assign" && c[3].supplierId === "s1"));
    await ctx.call("pdWithdraw('p1','t2')");
    assert.ok(ctx.calls.some((c) => c[0] === "confirm" && c[2] === "Withdraw"));
    assert.ok(ctx.calls.some((c) => c[1] === "/projects/p1/tasks/t2/withdraw"));
    await ctx.call("pdComplete('p1')");
    assert.ok(ctx.calls.some((c) => c[1] === "/projects/p1/complete"));
  });

  it("removed the old dialogs from every layer", () => {
    assert.doesNotMatch(read("app.js"), /function editProject|function openSupport|function completeProject|function addPhase/);
    assert.doesNotMatch(read("workflows.js"), /function wfAddPhase|function wfEditTask|function wfAssignTask|function wfUpdateProgress/);
    assert.doesNotMatch(read("safe-actions.js"), /deleteProject|wfDeleteTask|saTypeToConfirm/);
    assert.doesNotMatch(read("platform-additions.js"), /paReviewSuppliers|wfUpdateProgress = |completeProject = /);
    assert.doesNotMatch(read("invitations.js"), /invWithdraw|wfAssignSupplier/);
    assert.doesNotMatch(read("design-screens.js"), /dsShare/);
    assert.ok(read("index.html").includes('<script src="areas/project-pages.js"></script><script src="areas/project-dialogs.js"></script>'));
  });
});
