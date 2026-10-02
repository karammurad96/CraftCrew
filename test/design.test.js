// Design 2026 (T90–T105): static checks that the design layers are wired up correctly.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const PUBLIC = path.join(__dirname, "..", "public");
const read = (f) => readFileSync(path.join(PUBLIC, f), "utf8");
const index = read("index.html");

/* Runs public/design-screens.js in a VM with stubs for the globals of the older scripts it builds on.
   `extra` adds or replaces globals; `expose` lists top-level names to read back from the script. */
function loadScreens(extra = {}, expose = []) {
  const vm = require("node:vm");
  const ctx = {
    NG_GROUPS: { customer: [], supplier: [], admin: [] },
    ngGroup() {},
    obEnhanceHome() {},
    topActions() {},
    aqHtml: () => "",
    inBoard: async () => {},
    srEvent: async () => {},
    invoiceDetailPage: async () => {},
    MNAV_BOTTOM: { customer: [], supplier: [], admin: [[]] },
    ccNewTimeEntry: async () => {},
    window: { addEventListener() {} },
    route() {},
    money: (n) => String(n),
    date: (d) => d,
    publicLayout: (html) => html,
    api: async () => ({}),
    esc: (s) => String(s),
    supplierBadge: (s) => s.badge,
    state: {},
    app: { innerHTML: "" },
    document: { addEventListener() {}, getElementById: () => null, querySelector: () => null },
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    requestAnimationFrame() {},
    Date,
    ...extra,
  };
  const src = read("design-screens.js").replace("Object.assign(NG_GROUPS", "Object.assign(this.NG_GROUPS");
  vm.runInNewContext(src + ";" + expose.map((n) => `this.${n}=${n};`).join(""), ctx);
  return ctx;
}

describe("design 2026", () => {
  it("loads design-2026.css after every other stylesheet", () => {
    const sheets = [...index.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
    const at = sheets.indexOf("design-2026.css");
    assert.ok(at >= 0, "design-2026.css is not loaded");
    const later = sheets.slice(at + 1).filter((s) => s !== "design-screens.css");
    assert.deepEqual(later, [], "stylesheets loaded after design-2026.css");
    // The inline <style> block must come before it too.
    assert.ok(index.lastIndexOf("</style>") < index.indexOf("design-2026.css"));
  });

  it("translates fixed labels inside .ds-ui", () => {
    const scope = read("i18n.js").match(/const I18N_UI_SCOPE =\s*"([^"]+)"/)[1];
    assert.ok(
      scope.split(",").map((s) => s.trim()).includes(".ds-ui"),
      ".ds-ui is missing from I18N_UI_SCOPE",
    );
  });

  it("draws every .brand-mark with the Flow mark (T91)", () => {
    const { readdirSync } = require("node:fs");
    const FLOW =
      '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path d="M14 50C24 42 40 22 50 14"/><circle cx="14" cy="50" r="8.5"/><circle cx="50" cy="14" r="8.5"/></svg>';
    const files = [...readdirSync(PUBLIC).filter((f) => f.endsWith(".js")), "index.html"];
    let marks = 0;
    for (const f of files) {
      const src = read(f);
      assert.doesNotMatch(src, /M25\.8 8\.5/, `${f} still has the old logo`);
      for (const m of src.matchAll(/<span class="brand-mark"[^>]*>(<svg[\s\S]*?<\/svg>)/g)) {
        marks++;
        assert.equal(m[1], FLOW, `${f} has a .brand-mark that is not the Flow mark`);
      }
    }
    assert.ok(marks >= 8, `expected at least 8 logos, found ${marks}`);
  });

  it("loads design-screens.js after invitations.js and before i18n.js", () => {
    const scripts = [...index.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    const at = scripts.indexOf("design-screens.js");
    assert.ok(at > scripts.indexOf("invitations.js"), "design-screens.js must follow invitations.js");
    assert.ok(at < scripts.indexOf("i18n.js"), "design-screens.js must come before i18n.js");
  });

  it("tints status chips by meaning and says how late (T92)", () => {
    const ctx = loadScreens({}, ["dsTone", "dsDaysLate"]);
    const chip = (text, ...classes) => ({
      nodeType: 1,
      childNodes: [{ nodeType: 3, textContent: text }],
      classList: { contains: (c) => classes.includes(c) },
    });
    const cases = [
      ["Not Started", "grey"],
      ["Draft", "grey"],
      ["Awaiting acceptance", "orange"],
      ["Submitted", "orange"],
      ["In Progress", "blue"],
      ["In review", "purple"],
      ["Approved", "green"],
      ["Paid", "green"],
      ["Changes Requested", "red"],
      ["5 days late", "red"],
      ["Expired 3 Oct 2026", "red"],
    ];
    for (const [text, tone] of cases) assert.equal(ctx.dsTone(chip(text, "submitted")), tone, text);
    // Meaning wins over a misleading class: admin billing shows "Approved" with class "submitted".
    assert.equal(ctx.dsTone(chip("Approved", "submitted")), "green");
    // Unknown text falls back to the class.
    assert.equal(ctx.dsTone(chip("Something", "in-progress")), "blue");
    const ago = (n) => {
      const d = new Date();
      d.setDate(d.getDate() - n);
      return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    };
    assert.equal(ctx.dsDaysLate(ago(5)), "5 days late");
    assert.equal(ctx.dsDaysLate(ago(1)), "1 day late");
    assert.equal(ctx.dsDaysLate(""), "Overdue");
  });

  it("has German for the late chip (T92)", () => {
    const src = read("i18n.js");
    assert.match(src, /"1 day late": "1 Tag verspätet"/);
    assert.match(src, /\[\/\^\(\\d\+\) days late\$\/, "\$1 Tage verspätet"\]/);
  });

  it("loads design-screens.css right after design-2026.css (T93)", () => {
    const sheets = [...index.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(sheets.slice(-2), ["design-2026.css", "design-screens.css"]);
  });

  it("shows the daily pages first in the sidebar and has German for every label (T93)", () => {
    const ctx = loadScreens({}, ["DS_SIDE_LABELS"]);
    const NG_GROUPS = ctx.NG_GROUPS;
    ctx.labels = ctx.DS_SIDE_LABELS;
    const main = (role) => JSON.parse(JSON.stringify(NG_GROUPS[role][0][1]));
    assert.deepEqual(main("customer"), ["dashboard", "projects", "approvals", "sourcing", "invoices", "messages"]);
    assert.deepEqual(main("supplier"), ["dashboard", "projects", "planning", "bids", "invoices", "compliance"]);
    assert.deepEqual(main("admin"), ["dashboard", "applications", "users", "billing", "disputes", "reports"]);
    for (const role of ["customer", "supplier", "admin"]) {
      assert.equal(NG_GROUPS[role].length, 1, "everything else lands under More");
      assert.equal(NG_GROUPS[role][0][0], "", "the first group has no heading");
      assert.deepEqual(JSON.parse(JSON.stringify(Object.keys(ctx.labels[role]))), main(role));
    }
    const de = read("i18n.js");
    for (const label of [...Object.values(ctx.labels).flatMap(Object.values), "More"])
      assert.match(de, new RegExp(`^  (${label}|"${label}"): "`, "m"), `no German for ${label}`);
  });

  it("renders the landing page from the board, with German for every text (T94)", async () => {
    const ctx = loadScreens({ api: async () => ({ suppliers: [] }) });
    const app = ctx.app;
    await ctx.renderHome();
    const html = app.innerHTML;
    for (const link of ["#/signup", "#/suppliers", "#/supplier-application"])
      assert.ok(html.includes(`href="${link}"`), `missing link ${link}`);
    assert.match(html, /<h1>Every crew\. One project\. Zero chaos\.<\/h1>/);
    const texts = [...html.matchAll(/>([^<>]*[A-Za-z][^<>]*)</g)].map((m) => m[1].trim()).filter(Boolean);
    const de = read("i18n.js");
    const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const missing = texts.filter(
      (t) => !new RegExp(`^\\s+(${esc(t)}|${esc(JSON.stringify(t))}):`, "m").test(de) && !/^[\d\s%€·,.-]+$/.test(t),
    );
    // Example-only strings that stay the same in German
    assert.deepEqual(
      missing.filter((t) => !["Oct", "55 %"].includes(t)),
      [],
      "English texts without a German entry",
    );
  });

  it("builds the customer dashboard header and decision rows from the queue (T95)", () => {
    const ctx = loadScreens(
      { money: (n) => `€${n}`, date: (d) => d, aqHtml: () => "base" },
      ["dsDecisionLine", "dsGreeting", "dsCustomerRow"],
    );
    assert.equal(ctx.dsDecisionLine(0), "Nothing needs a decision. Everything is on track.");
    assert.equal(ctx.dsDecisionLine(1), "One thing needs a decision. Everything else is on track.");
    assert.equal(ctx.dsDecisionLine(4), "4 things need a decision. Everything else is on track.");
    assert.match(ctx.dsGreeting("Maya Hartmann"), /^Good (morning|afternoon|evening), Maya\.$/);
    const inv = ctx.dsCustomerRow({
      kind: "invoice",
      link: "/customer/invoice/inv_1",
      invoiceId: "inv_1",
      number: "2026-0001",
      amount: 8806,
      supplier: "Keller Automation",
      sub: "Robot cell",
    });
    assert.match(inv, /Invoice 2026-0001 · €8806/);
    assert.match(inv, /href="#\/customer\/invoice\/inv_1"[^>]*>Review</);
    assert.match(inv, /dsApproveInvoice\('inv_1', this\)">Approve</);
    const offer = ctx.dsCustomerRow({ kind: "offer", link: "/customer/offers?project=p", bidId: "bid_1", offers: 3, title: "Vision", best: { amount: 18900, supplier: "Rhein" } });
    assert.match(offer, /3 offers · Vision/);
    assert.match(offer, /href="#\/customer\/sourcing\/bid_1"[^>]*>Compare</);
    // The row title keeps the old action-queue link, so no link is lost
    assert.match(offer, /class="ds-dec-title" href="#\/customer\/offers\?project=p"/);
    const time = ctx.dsCustomerRow({ kind: "time", link: "/customer/time", entries: 2, hours: 14.5, suppliers: ["Keller"] });
    assert.match(time, /2 time entries · 14\.5 h/);
    const late = ctx.dsCustomerRow({ kind: "overdue", link: "/customer/projects/p", projectId: "p", phaseId: "ph", taskId: "t", taskName: "PLC", dueDate: "2000-01-01" });
    assert.match(late, /PLC is \d+ days late/);
    assert.match(late, /\/customer\/messages\?project=p&amp;phase=ph&amp;task=t|\/customer\/messages\?project=p&phase=ph&task=t/);
    const de = read("i18n.js");
    for (const p of ["things need a decision", "is (\\\\d+) days late", "time entries", "offers · ", "Good morning"])
      assert.ok(de.includes(p.replace(/\\\\/g, "\\")), `no German pattern for ${p}`);
  });

  it("shows the newest invitation as a card with the existing answer actions (T96)", () => {
    const ctx = loadScreens({ money: (n) => `€${n}` }, ["dsInviteCard"]);
    const v = { projectId: "p1", taskId: "t1", name: "Weld test", project: "Line 4", phase: "Build", customer: "MAKBERG", startDate: "2099-09-24", dueDate: "2099-10-11", orderAmount: 1000 };
    const html = ctx.dsInviteCard({ kind: "invitation", link: "/supplier/projects?invite=t1", invite: v });
    assert.match(html, /New invitation · MAKBERG/);
    assert.match(html, /onclick="invAnswerTask\('p1', 't1', true\)">Accept Job</);
    assert.match(html, /onclick="invAnswerTask\('p1', 't1', false\)">Decline</);
    assert.match(html, /href="#\/supplier\/messages\?project=p1">Ask a question ›</);
    assert.match(html, /€1000/);
    const phase = ctx.dsInviteCard({ kind: "invitation", link: "/x", invite: { ...v, taskId: undefined, phaseId: "ph1" } });
    assert.match(phase, /invAnswerPhase\('p1', 'ph1', true\)/);
    const de = read("i18n.js");
    for (const p of ["new jobs are waiting for your answer", "of (\\\\d+) free", '"Accept Job"', '"Paid this year"'])
      assert.ok(de.includes(p.replace(/\\\\/g, "\\")), `no German for ${p}`);
  });

  it("gives the admin dashboard the same decision list and German labels (T97)", () => {
    const ctx = loadScreens({ state: { user: { role: "admin", name: "Admin" } } }, ["aqHtml"]);
    const html = ctx.aqHtml({
      items: [
        { kind: "application", text: "Vet application: NordWerk", sub: "New", link: "/admin/applications", action: "Review" },
        { kind: "payment", text: "Mark invoice 2026-0001 as paid", sub: "Due 2026-10-04", link: "/admin/billing", action: "Record", amount: 32000 },
      ],
      total: 2,
    });
    assert.match(html, /Needs your decision/);
    assert.match(html, /href="#\/admin\/applications"[^>]*>Review</);
    assert.match(html, /href="#\/admin\/billing"[^>]*>Record</);
    assert.match(html, /data-ds-fill="stats"/);
    assert.match(html, /More on your dashboard/);
    const de = read("i18n.js");
    for (const k of ['"Live suppliers"', '"Invoice volume"', '"At a glance"'])
      assert.ok(de.includes(k), `no German for ${k}`);
  });

  it("files the project page into tabs and keeps the supplier away from the budget (T98)", () => {
    const ctx = loadScreens({ invNo: (i) => i.number }, ["dsWsUpNext", "dsWsSide", "dsWsPhases", "DS_WS_TASKS", "DS_WS_ACTIVITY"]);
    const t = (id, extra) => ({ id, name: id, status: "In Progress", dueDate: "2000-01-01", progress: 50, assignedSupplierId: "s1", acceptanceStatus: "Accepted", orderAmount: 1000, assignmentHistory: [{ supplierId: "s1", company: "Keller" }], ...extra });
    const d = {
      project: { id: "p1", name: "P", budget: 10000, dueDate: "2099-01-01", phases: [{ id: "ph", name: "Build", tasks: [t("late"), t("invited", { acceptanceStatus: "Pending", dueDate: "2099-01-01" })] }] },
      invoices: [{ id: "i1", number: "2026-0001", status: "Submitted", amount: 500 }],
      entries: [{ status: "Pending approval", hours: 4 }],
      documents: [{ status: "Pending approval" }],
    };
    const customer = { role: "customer", pid: "p1" };
    const next = ctx.dsWsUpNext(customer, d);
    assert.match(next, /href="#\/customer\/invoice\/i1"[^>]*>Review</);
    assert.match(next, /href="#\/customer\/time"[^>]*>Review</);
    assert.match(next, /invited is waiting for Keller/);
    assert.match(next, /1 document to approve/);
    assert.match(next, /late · \d+ days late/);
    assert.match(ctx.dsWsSide(customer, d), /Budget/);
    ctx.state.user = { role: "supplier", supplierId: "s1" };
    const side = ctx.dsWsSide({ role: "supplier", pid: "p1" }, d);
    assert.doesNotMatch(side, />Budget</, "suppliers never see the customer budget");
    assert.match(side, /Your order value/);
    assert.match(ctx.dsWsPhases(customer, d), /0 of 2 tasks · 1 late/);
    // The Gantt chart, task panel and time details live in Tasks; the activity log in Activity
    assert.ok(["project-timeline", "project-task-panel", "ff-task-time-details"].every((c) => ctx.DS_WS_TASKS.includes(c)));
    assert.ok(ctx.DS_WS_ACTIVITY.includes("pa-project-activity"));
  });

  it("opens a side panel from the board and keeps the column statuses (T99)", () => {
    const src = read("design-screens.js");
    // Labels only: the data statuses stay "Not Started" / "Completed", and "On Hold" stays
    assert.match(src, /const DS_COL_LABEL = \{ "Not Started": "To Do", Completed: "Done" \}/);
    // inBoard is wrapped, so drag and drop, arrow keys and the move locks of insights.js stay
    assert.match(src, /const dsBaseInBoard = inBoard;/);
    // Ctrl/Cmd/Shift-click still opens the task page
    assert.match(src, /e\.ctrlKey \|\| e\.metaKey \|\| e\.shiftKey/);
    // Ticking sends the task's checklist
    assert.match(src, /method: "PATCH", body: \{ subtasks: next \}/);
    const de = read("i18n.js");
    for (const k of ['"To Do"', '"Open Task"', '"Latest update"', "Checklist · "]) assert.ok(de.includes(k), `no German for ${k}`);
  });

  it("compares offers as cards with the existing actions (T100)", () => {
    const ctx = loadScreens({ money: (n) => `€${n}`, bmRateNote: () => "" }, ["dsOfferCard", "dsDocsRow"]);
    const bid = { id: "bid_1", category: "Robotics" };
    const r = (o, extra) => ({ o: { id: "o1", supplierCompany: "Rhein Robotics", amount: 18900, deliveryDays: 21, status: "Submitted", ...o }, s: { location: "Nuremberg" }, card: { metrics: { rating: 4.6 }, risks: [] }, score: 86, savings: 2100, ...extra });
    const best = ctx.dsOfferCard(bid, r({}), 0, false, true, 2);
    assert.match(best, /Best match · 86/);
    assert.match(best, /€2100 under your budget/);
    assert.match(best, /★ 4\.6 · 2 jobs with you/);
    assert.match(best, /All valid/);
    assert.match(best, /onclick="srAward\('bid_1','o1'\)">Award Rhein</);
    assert.match(best, /rvRequestOfferChanges\('bid_1','o1'\)">Request changes/);
    assert.match(best, /reviewOfferTalk\('bid_1','o1'\)">Ask for details/);
    assert.match(best, /wfBidDecision\('bid_1','o1','Decline offer'\)">Eliminate/);
    const revised = ctx.dsOfferCard(bid, r({ revisions: [{ amount: 18000 }] }, { score: 81 }), 1, false, true, 0);
    assert.match(revised, /Revised · 81/);
    assert.match(revised, /Was €18000/);
    assert.match(revised, /new to you/);
    assert.match(ctx.dsOfferCard(bid, r({}, { savings: -1400 }), 2, true, true, 0), /Fastest · 86[\s\S]*€1400 over your budget/);
    // Documents: unknown insurance leaves the row out; an expiring certificate is orange
    assert.equal(ctx.dsDocsRow({ risks: [{ text: "No insurance evidence on file" }] }), "");
    assert.match(ctx.dsDocsRow({ risks: [{ text: "Liability insurance expires in 19 day(s)" }] }), /ds-orange">1 expires/);
    // A decided offer shows its status instead of the actions
    assert.doesNotMatch(ctx.dsOfferCard(bid, r({ status: "Accepted" }), 0, false, true, 0), /srAward/);
  });

  it("lays out the invoice as paper and a review panel with the existing actions (T101)", () => {
    const src = read("design-screens.js");
    assert.match(src, /const dsBaseInvoiceDetail = invoiceDetailPage;/);
    // The existing Approve / Request changes / Reject buttons move into the panel (their onclick stays)
    assert.match(src, /\["Approve", "Request Changes", "invoiceReject"\]\.map/);
    // A filled note is sent as the comment instead of opening the prompt
    assert.match(src, /e\.stopImmediatePropagation\(\);[\s\S]{0,80}method: "PATCH", body: \{ action, comment: note \}/);
    // Lines that are new against the previous revision get a "new" chip
    assert.match(src, /prev && !prevLines\.some\(\(y\) => same\(x, y\)\)/);
    // Notices, VAT notes, payment terms and the revision history stay below the paper
    assert.match(src, /el\.matches\("\.invoice-paper-head, \.wf-stat-grid, \.cc-table-wrap, \.invoice-totals, \.action-row"\)/);
    const de = read("i18n.js");
    for (const k of ['"Approve and Schedule Payment"', '"Within order cap"', '"BILL TO"', "corrected by"]) assert.ok(de.includes(k), `no German for ${k}`);
  });

  it("labels the phone bottom bar and gives suppliers a Today screen (T102)", () => {
    const MNAV_BOTTOM = { customer: [], supplier: [], admin: [["dashboard", "Dashboard"], ["applications", "Vetting"]] };
    const ctx = loadScreens({ MNAV_BOTTOM }, []);
    const labels = (role) => JSON.parse(JSON.stringify(ctx.MNAV_BOTTOM[role]));
    assert.deepEqual(labels("supplier"), [["dashboard", "Today"], ["projects", "Jobs"], ["time", "Time"], ["messages", "Messages"]]);
    assert.deepEqual(labels("customer"), [["dashboard", "Today"], ["projects", "Projects"], ["approvals", "Approvals"], ["messages", "Messages"]]);
    const src = read("design-screens.js");
    // The quick actions use the existing forms
    for (const fn of ["ccNewTimeEntry()", "drOpen(j.projectId, j.taskId)", "puOpen(j.projectId, j.taskId)", "cmSupplierVisit("])
      assert.ok(src.includes(fn), `Today uses ${fn}`);
    // Desktop does not change: the Today block only shows up to 640 px
    assert.match(read("design-screens.css"), /html body \.ds-today \{\n  display: none;\n\}\n@media \(max-width: 640px\)/);
  });

  it("regroups the Log time form without losing a field (T103)", () => {
    const src = read("design-screens.js");
    assert.match(src, /const dsBaseNewTime = ccNewTimeEntry;/);
    // Every field of today's form is moved into a row, none is rebuilt
    for (const f of ['#ffTimeTarget', '#ffTimeSearch', '[name="employeeName"]', '[name="workDate"]', '[name="location"]', '[name="startTime"]', '[name="endTime"]', '[name="breakMinutes"]', '[name="description"]'])
      assert.ok(src.includes(`$("${f.replace(/"/g, '\\"')}")`) || src.includes(`$('${f}')`), `field ${f} is kept`);
    // The break segments set the existing break field; the button shows the live hours
    assert.match(src, /pause\.value = b\.dataset\.m;/);
    assert.match(src, /`Submit \$\{h\.toFixed\(1\)\} Hours`/);
    // The offline banner follows the connection
    assert.match(src, /banner\.hidden = navigator\.onLine/);
    const de = read("i18n.js");
    for (const k of ["No signal. Saved on this phone and sent later.", "Submit (\\d+[.,]\\d) Hours", '"Billable time"'])
      assert.ok(de.includes(k.replace(/\\\\/g, "\\")), `no German for ${k}`);
  });

  it("uses a new service worker cache so installed apps load the new files", () => {
    assert.match(read("sw.js"), /const CACHE = "craftcrew-shell-v2"/);
  });
});
