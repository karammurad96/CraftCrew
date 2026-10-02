// T128c: the task and phase pages and the task board (T99) render from translation keys with data-action
// handlers; names and statuses keep the old translation, the column statuses stay the data statuses.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (f) => readFileSync(path.join(__dirname, "..", "public", f), "utf8");
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const PROJECT = {
  id: "p1",
  name: "Line 4",
  startDate: day(-20),
  dueDate: day(30),
  phases: [
    {
      id: "ph1",
      name: "Build & integration",
      status: "In Progress",
      startDate: day(-20),
      dueDate: day(10),
      tasks: [
        { id: "t1", name: "PLC", description: "Controls", status: "In Progress", progress: 40, dueDate: day(-3), assignedSupplierId: "s1", acceptanceStatus: "Accepted", orderAmount: 1000, estimatedHours: 20, subtasks: [{ name: "Wiring", done: false }], progressUpdates: [{ progress: 40, status: "In Progress", note: "Half way", byName: "Marta", company: "Keller", at: new Date().toISOString() }] },
        { id: "t2", name: "Weld test", status: "Not Started", dueDate: day(5), assignedSupplierId: "s2", acceptanceStatus: "Pending" },
        { id: "t3", name: "FAT", status: "Completed", progress: 100, dueDate: day(-5), assignedSupplierId: "s1", acceptanceStatus: "Accepted" },
      ],
    },
    { id: "ph2", name: "Handover", status: "Not Started", dueDate: day(25), tasks: [] },
  ],
};

function area(lang, role, hash) {
  const warnings = [],
    calls = [];
  const ctx = {
    console: { warn: (...a) => warnings.push(a.join(" ")), error() {}, log() {} },
    localStorage: { getItem: (k) => (k === "cc_lang" ? lang : null) },
    navigator: { language: "en-GB" },
    document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null },
    window: null,
    location: { hash },
    Intl,
    URLSearchParams,
    app: { innerHTML: "" },
    state: { user: { role, name: "Maya", supplierId: "s1" } },
    route: async () => {},
    topActions() {},
    navigate: (to) => calls.push(["navigate", to]),
    toast() {},
    toastEl: { dataset: {} },
    renderNotFound: () => calls.push(["notFound"]),
    dashboardShell: (r, active, html) => `[${r}:${active}]${html}`,
    esc: (s) => String(s ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]),
    ccNewTimeEntry: () => calls.push(["logTime"]),
    pdProgress: (...a) => calls.push(["progress", ...a]),
    api: async (p, opts) => {
      calls.push(["api", p, opts?.method || "GET", opts?.body]);
      if (p === "/projects/p1") return { project: JSON.parse(JSON.stringify(PROJECT)), suppliers: [{ id: "s1", company: "Keller" }, { id: "s2", company: "Rhein" }] };
      if (p.startsWith("/time-entries")) return { entries: [{ status: "Approved", hours: 7.5, amount: 1110 }] };
      return {};
    },
  };
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  vm.createContext(ctx);
  for (const f of ["locales/en.js", "locales/de.js", "core/t.js", "core/actions.js", "core/router.js", "areas/project-pages.js"])
    vm.runInContext(read(f), ctx, { filename: f });
  Object.assign(ctx, { warnings, calls });
  ctx.render = async () => (await ctx.route(), ctx.app.innerHTML);
  return ctx;
}
const text = (html) => html.replace(/<[^>]*>/g, " ");

describe("task and phase pages, task board (T128c)", () => {
  for (const lang of ["en", "de"])
    for (const [role, hash] of [["customer", "#/customer/projects/p1/tasks/t1"], ["customer", "#/customer/projects/p1/phases/ph1"], ["supplier", "#/supplier/projects/p1/tasks/t1"], ["customer", "#/customer/projects/p1/board"], ["supplier", "#/supplier/projects/p1/board"]])
      it(`draws ${hash} in ${lang === "en" ? "English" : "German"} from keys`, async () => {
        const ctx = area(lang, role, hash),
          html = await ctx.render();
        assert.deepEqual(ctx.warnings, []);
        assert.doesNotMatch(text(html), /\bsub\.[a-zA-Z.]+/, "raw key");
        assert.doesNotMatch(html, /\son[a-z]+="/, "no inline handlers");
        assert.match(html, /data-i18n="keys"/);
      });

  it("shows time against the estimate, the progress updates and the supplier's own buttons", async () => {
    const supplier = await area("en", "supplier", "#/supplier/projects/p1/tasks/t1").render();
    assert.ok(supplier.includes("7.5 of 20 hours approved (38%). €1,110 approved time value."));
    assert.ok(supplier.includes('data-action="sub.logTime">+ Log time</button>'));
    assert.match(supplier, /data-action="sub\.progress"[^>]*data-task="t1" data-progress="40">Post update</);
    assert.ok(supplier.includes("Progress updates · 40%") && supplier.includes("<p>Half way</p>"));
    assert.ok(supplier.includes('href="#/supplier/projects/p1/documents?phase=ph1&amp;task=t1"'));
    const phase = await area("de", "customer", "#/customer/projects/p1/phases/ph1").render();
    assert.ok(phase.includes("PROJEKTPHASE") && phase.includes('<h1><bdi data-i18n="dom">Build &amp; integration</bdi></h1>'));
    assert.doesNotMatch(phase, /sub\.logTime|pa-updates/);
    const missing = area("en", "customer", "#/customer/projects/p1/tasks/nope");
    await missing.render();
    assert.deepEqual(missing.calls.at(-1), ["notFound"]);
  });

  it("draws the board with column labels, locks, chips and the phase order; statuses stay data", async () => {
    const html = await area("en", "customer", "#/customer/projects/p1/board").render();
    for (const [status, label] of [["Not Started", "To Do"], ["In Progress", "In Progress"], ["On Hold", "On Hold"], ["Completed", "Done"]])
      assert.match(html, new RegExp(`data-status="${status}"><header>.*?<b>${label}</b>`));
    assert.match(html, /data-task="t1" tabindex="0" data-ds-panel="1">/);
    assert.ok(html.includes("3 days late"));
    assert.ok(html.includes("Awaiting Rhein"));
    // A phase without tasks is a card of its own that opens the phase page
    assert.ok(html.includes('href="#/customer/projects/p1/phases/ph2" class="ds-card-title"'));
    assert.ok(html.includes('<ol id="inPhaseList">'));
    assert.match(html, /<select id="inPhase" aria-label="Phase" data-action="board\.phase" class="ds-hidden">/);
    const supplier = await area("en", "supplier", "#/supplier/projects/p1/board").render();
    assert.doesNotMatch(supplier, /inPhaseList|Weld test/, "suppliers see their own work, no phase order");
  });

  it("removed the old pages and the board layers", () => {
    assert.doesNotMatch(read("collaboration.js"), /ccProjectSubpage/);
    assert.doesNotMatch(read("insights.js"), /function inBoard|inBindBoard|inMoveCard/);
    assert.doesNotMatch(read("design-screens.js"), /dsBaseInBoard|dsOpenPanel|DS_COL_LABEL/);
    assert.doesNotMatch(read("platform-additions.js"), /paTaskUpdates/);
    // Ctrl/Cmd/Shift-click still opens the task page; ticking sends the whole checklist
    const src = read("areas/project-pages.js");
    assert.match(src, /e\.ctrlKey \|\| e\.metaKey \|\| e\.shiftKey/);
    assert.match(src, /method: "PATCH", body: \{ subtasks: next \}/);
  });
});
