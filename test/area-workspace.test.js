// T128b: the project workspace renders in one pass from translation keys: header with its actions, tabs
// (Overview, Tasks, Files, Messages, Invoices, Activity), overview cards (T98), phases and task cards with the
// buttons of site reports, defects, acceptance and invitations, and the supplier's narrower view.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (f) => readFileSync(path.join(__dirname, "..", "public", f), "utf8");
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const task = (id, extra) => ({
  id,
  name: id,
  status: "In Progress",
  startDate: day(-10),
  dueDate: day(5),
  progress: 50,
  assignedSupplierId: "s1",
  acceptanceStatus: "Accepted",
  orderAmount: 1000,
  assignmentHistory: [{ supplierId: "s1", company: "Keller", status: "Accepted", at: day(-9) }],
  ...extra,
});
function project(extra) {
  return {
    id: "p1",
    name: "Line 4",
    description: "Robot cell",
    status: "In Progress",
    budget: 10000,
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
          task("late", { dueDate: day(-3) }),
          task("invited", { acceptanceStatus: "Pending", assignmentHistory: [{ supplierId: "s1", company: "Keller", status: "Invited", at: day(-1) }] }),
          task("handed", { status: "Under Review", defects: [{ status: "open" }] }),
          task("free", { assignedSupplierId: null, acceptanceStatus: "Declined", assignmentHistory: [{ company: "Rhein", status: "Declined", reason: "Too busy", at: day(-2) }] }),
        ],
      },
    ],
    ...extra,
  };
}

function area(lang, role, { hash = `#/${role}/projects/p1`, proj = project(), user = {} } = {}) {
  const warnings = [],
    calls = [];
  const ctx = {
    console: { warn: (...a) => warnings.push(a.join(" ")), error() {}, log() {} },
    localStorage: { getItem: (k) => (k === "cc_lang" ? lang : null) },
    navigator: { language: "en-GB" },
    document: { addEventListener() {} },
    location: { hash },
    Intl,
    URLSearchParams,
    app: { innerHTML: "" },
    state: { user: { role, name: "Maya", company: "MAKBERG", supplierId: "s1", ...user } },
    route: async () => calls.push(["route"]),
    topActions() {},
    navigate() {},
    toast() {},
    toastEl: { dataset: {} },
    dashboardShell: (r, active, html) => `[${r}:${active}]${html}`,
    esc: (s) => String(s ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]),
    invNo: (i) => i.number,
    api: async (p) => {
      calls.push(["api", p]);
      if (p === "/projects/p1") return { project: proj, suppliers: [{ id: "s1", company: "Keller" }], invoices: [{ id: "i1", number: "2026-0001", status: "Submitted", amount: 500, projectId: "p1" }] };
      if (p === "/projects/p1/documents") return { documents: [{ status: "Pending approval", phaseId: "ph1" }] };
      if (p === "/invoices") return { invoices: [{ id: "i1", number: "2026-0001", status: "Submitted", amount: 500, projectId: "p1" }] };
      if (p.startsWith("/time-entries")) return { entries: [{ status: "Pending approval", hours: 4 }, { status: "Approved", taskId: "late", hours: 7.5, amount: 1110 }] };
      if (p === "/projects/p1/activity") return { entries: [{ action: "Task updated", actorName: "Maya", at: new Date().toISOString() }] };
      if (p.startsWith("/nav-counts")) return { counts: { projectMessages: 3 } };
      if (p === "/projects/p1/reviews") return { suppliers: [{ company: "Keller" }] };
      return {};
    },
  };
  for (const fn of ["pdEditProject", "pdSupport", "pdDeleteProject", "pdShare", "pdEditTask", "drOpen", "puOpen", "acOpen", "pdWithdraw", "pdProgress"])
    ctx[fn] = (...a) => calls.push([fn, ...a]);
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ["locales/en.js", "locales/de.js", "core/t.js", "core/actions.js", "core/router.js", "areas/workspace.js"])
    vm.runInContext(read(f), ctx, { filename: f });
  Object.assign(ctx, { warnings, calls });
  ctx.render = async () => (await ctx.route(), ctx.app.innerHTML);
  ctx.run = (name, dataset) => vm.runInContext("actions", ctx).run(name, { dataset, closest: () => ({ open: true }) }, { type: "click" });
  return ctx;
}
const text = (html) => html.replace(/<[^>]*>/g, " ");

describe("project workspace area (T128b)", () => {
  for (const lang of ["en", "de"])
    for (const role of ["customer", "supplier"])
      it(`draws the ${role} workspace in ${lang === "en" ? "English" : "German"} from keys`, async () => {
        const ctx = area(lang, role),
          html = await ctx.render();
        assert.ok(html.startsWith(`[${role}:projects]<div data-i18n="keys" class="breadcrumb">`));
        assert.deepEqual(ctx.warnings, []);
        assert.doesNotMatch(text(html), /\bws\.[a-zA-Z.]+/, "raw key");
        assert.doesNotMatch(html, /\son[a-z]+="/, "no inline handlers");
        for (const tab of ["overview", "tasks", "activity"]) assert.match(html, new RegExp(`<div data-i18n="keys" class="ds-ws-pane ds-ws-${tab}" data-tab="${tab}"`));
        if (lang === "de") assert.ok(html.includes("Als Nächstes") && html.includes("Projektphasen"));
      });

  it("gives the customer the header actions, the overview and every task-card button", async () => {
    const ctx = area("en", "customer"),
      html = await ctx.render();
    assert.ok(html.includes('<span class="ds-ws-meta">MAKBERG · '));
    for (const a of ["ws.share", "ws.edit", "ws.support", "ws.delete", "ws.addPhase", "ws.complete", "ws.editPhase", "ws.addTask"]) assert.ok(html.includes(`data-action="${a}"`), a);
    assert.ok(html.includes('href="#/customer/projects/p1/board">▦ Board view</a>'));
    assert.ok(html.includes('href="#/customer/invoices?project=p1">Review invoices</a>'));
    assert.ok(html.includes(">Files (1)</a>") && html.includes(">Messages · 3</a>"));
    // Overview (T98): up next, phases, progress, budget, suppliers
    assert.match(html, /href="#\/customer\/invoice\/i1"[^>]*>Review</);
    assert.ok(html.includes("Approve 1 time entry"));
    assert.ok(html.includes("invited is waiting for Keller"));
    assert.ok(html.includes("1 document to approve"));
    assert.match(html, /late · 3 days late/);
    assert.ok(html.includes("0 of 4 tasks · 1 late"));
    assert.ok(html.includes(">Budget</h3>") && html.includes(">Suppliers</h3>"));
    // Task cards: site reports, defects with the open count, acceptance, invitation and decline notes
    assert.ok(html.includes('data-action="ws.reports" data-project="p1" data-phase="ph1" data-task="late"'));
    assert.match(html, /data-action="ws\.defects"[^>]*data-task="handed">Defects <span class="pu-count" aria-label="1 open">1<\/span>/);
    assert.match(html, /data-action="ws\.acceptWork"[^>]*data-task="handed">Accept work</);
    assert.match(html, /<span class="status pending">Awaiting acceptance<\/span>/);
    assert.match(html, /Invitation sent to <b>Keller<\/b> on [^.]+\. Work, time sheets/);
    assert.match(html, /data-action="ws\.withdraw"[^>]*data-task="invited"/);
    assert.ok(html.includes("<b>Rhein</b> declined this task: “Too busy” Choose another supplier"));
    assert.ok(html.includes('href="#/customer/projects/p1/documents?phase=ph1&amp;task=late"'));
    assert.ok(html.includes('href="#/customer/messages?project=p1&amp;phase=ph1&amp;task=late&amp;back=%2Fcustomer%2Fprojects%2Fp1"'));
    assert.ok(html.includes("This task is overdue."));
    // Task time, activity, stored names keep the old translation
    assert.ok(html.includes("7.5 h"));
    assert.ok(html.includes('<b><bdi data-i18n="dom">Task updated</bdi></b>'));
    assert.ok(html.includes('<h3><bdi data-i18n="dom">Build &amp; integration</bdi></h3>'));
  });

  it("keeps the supplier away from the budget and project editing", async () => {
    const html = await area("en", "supplier").render();
    assert.doesNotMatch(html, />Budget</, "suppliers never see the customer budget");
    assert.ok(html.includes(">Your order value</h3>"));
    for (const a of ["ws.share", "ws.edit", "ws.delete", "ws.addPhase", "ws.editTask", "ws.bid"]) assert.ok(!html.includes(`data-action="${a}"`), a);
    assert.ok(html.includes("Only the tasks given to your company are shown."));
    assert.match(html, /data-action="ws\.progress"[^>]*data-task="late" data-progress="50">Update progress</);
    // A pending task only offers the answer
    assert.match(html, /<span class="status pending">Waiting for your answer<\/span>/);
    assert.match(html, /data-action="dash\.answer" data-project="p1" data-task="invited" data-accept="true">Accept</);
    assert.doesNotMatch(html, /data-action="ws\.(progress|offer)"[^>]*data-task="invited"/);
  });

  it("shows a supplier who is only invited the invitation first, without tabs", async () => {
    const html = await area("en", "supplier", { proj: project({ involvement: "invited" }) }).render();
    assert.ok(!html.includes("ds-ws-tabs"));
    assert.ok(html.includes("You are invited to a task on this project."));
    assert.ok(html.includes('<div data-i18n="keys" class="wf-stat-grid">'));
    assert.doesNotMatch(html, /Compare offers/);
  });

  it("opens the tab from the address and lists supplier reviews of a completed project", async () => {
    const html = await area("en", "customer", { hash: "#/customer/projects/p1?tab=activity", proj: project({ status: "Completed", completedAt: day(-1) }) }).render();
    assert.match(html, /class="ds-ws-pane ds-ws-activity" data-tab="activity">/);
    assert.match(html, /class="ds-ws-pane ds-ws-overview" data-tab="overview" hidden>/);
    assert.match(html, /data-action="ws\.reviewSuppliers" data-project="p1">Review 1 supplier\(s\)</);
  });

  it("runs the existing dialogs from the buttons, and older dialogs re-render the current page", async () => {
    const ctx = area("en", "customer");
    await ctx.render();
    ctx.run("ws.edit", { project: "p1" });
    ctx.run("ws.delete", { project: "p1" });
    ctx.run("ws.editTask", { project: "p1", phase: "ph1", task: "late" });
    ctx.run("ws.defects", { project: "p1", task: "late" });
    ctx.run("ws.progress", { project: "p1", phase: "ph1", task: "late", progress: "50" });
    assert.deepEqual(
      ctx.calls.filter((c) => c[0] !== "api"),
      [["pdEditProject", "p1"], ["pdDeleteProject", "p1"], ["pdEditTask", "p1", "ph1", "late"], ["puOpen", "p1", "late"], ["pdProgress", "p1", "ph1", "late", 50]],
    );
    const loads = () => ctx.calls.filter((c) => c[1] === "/projects/p1").length,
      before = loads();
    ctx.app.innerHTML = "";
    await vm.runInContext("projectDetail('p1')", ctx);
    assert.equal(loads(), before + 1);
    assert.ok(ctx.app.innerHTML.includes("ds-ws-tabs"));
  });

  it("removed the old workspace layers", () => {
    assert.doesNotMatch(read("workflows.js"), /function wfTaskCard|function wfPhaseCard|function projectDetail/);
    for (const f of ["app.js", "enhancements.js"]) assert.doesNotMatch(read(f), /function projectDetail|function phaseCard|function timelinePosition/, f);
    for (const f of ["invitations.js", "areas/worksite.js"]) assert.doesNotMatch(read(f), /wfTaskCard|projectDetail = /, f);
    assert.doesNotMatch(read("design-screens.js"), /dsEnhanceWorkspace|dsWsUpNext|dsWsUnread/);
    assert.doesNotMatch(read("collaboration.js") + read("feedback-fixes.js"), /ccAddProjectLinks/);
    assert.doesNotMatch(read("insights.js"), /inBoardButton/);
    assert.doesNotMatch(read("platform-additions.js"), /paProjectExtras/);
    assert.doesNotMatch(read("safe-actions.js"), /saMoreMenu/);
  });
});
