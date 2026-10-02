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
    topActions() {},
    inBoard: async () => {},
    srEvent: async () => {},
    invoiceDetailPage: async () => {},
    ccNewTimeEntry: async () => {},
    ccTimeFilter: () => {},
    srApprovals: async () => {},
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
  const src = read("design-screens.js");
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
    // Pages that moved into area modules (T126–T135) keep their logos there
    const files = [
      ...readdirSync(PUBLIC).filter((f) => f.endsWith(".js")),
      ...readdirSync(path.join(PUBLIC, "areas")).map((f) => "areas/" + f),
      "index.html",
    ];
    let marks = 0;
    for (const f of files) {
      const src = read(f);
      assert.doesNotMatch(src, /M25\.8 8\.5/, `${f} still has the old logo`);
      for (const m of src.matchAll(/<span class="brand-mark"[^>]*>(<svg[\s\S]*?<\/svg>)/g)) {
        marks++;
        assert.equal(m[1], FLOW, `${f} has a .brand-mark that is not the Flow mark`);
      }
    }
    assert.ok(marks >= 4, `expected at least 4 logos (page header and footer, sign-in, shell), found ${marks}`);
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

  // T93 (sidebar groups and labels) and the T102 bottom bar moved to the shell area: test/area-shell.test.js

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

  it("gives suppliers a Today screen on phones (T102)", () => {
    const src = read("areas/dashboards.js");
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

  it("approves invoices and time from the Approvals page with the existing functions (T104)", () => {
    const src = read("design-screens.js");
    assert.match(src, /const dsBaseApprovals = srApprovals;/);
    assert.match(src, /dsApprovalDo\(\(\) => invoiceAction\('\$\{esc\(i\.id\)\}','Request Changes'\)\)/);
    assert.match(src, /dsApprovalDo\(\(\) => invoiceAction\('\$\{esc\(i\.id\)\}','Approve'\)\)/);
    assert.match(src, /dsApprovalDo\(\(\) => ccReviewTime\('\$\{esc\(e\.id\)\}','Approved'\)\)/);
    // The filter only hides sections
    assert.match(src, /sec\.classList\.toggle\("ds-hidden", b\.dataset\.show !== "all" && sec\.dataset\.dsKind !== b\.dataset\.show\)/);
    // The card stretch bug: the flex-basis of the first block must not become its height
    assert.match(read("design-screens.css"), /\.ds-approvals :is\(\.cm-visit, \.cm-doc, \.cm-site-ready\) > div:first-child \{\n  flex-basis: auto !important;/);
    assert.ok(read("i18n.js").includes('[/^All · (\\d+)$/, "Alle · $1"]'));
  });

  it("keeps the fixes of the final check (T105)", () => {
    const css = read("design-screens.css");
    // The invoice paper stays a real table on phones instead of stacked cards
    assert.match(css, /html body table\.ds-paper-lines\.mnav-cards \{\n    display: table !important;/);
    // Bottom bar labels keep 4.5:1 over content showing through the frosted bar
    assert.match(css, /html body \.mnav-bottom button \{\n    gap: 3px;\n[^}]*color: #545458;/);
    // Follow-ups for board details that need a feature are written down
    const tasks = readFileSync(path.join(__dirname, "..", "docs", "TASKS.md"), "utf8");
    for (const t of ["T106", "T107", "T108", "T109", "T110"]) assert.match(tasks, new RegExp(`#### ${t} · `));
  });

  it("sends time entry photos with the entry and queues both offline (T106)", async () => {
    const calls = [];
    const ctx = loadScreens({
      api: async (p, o) => (calls.push(["api", p]), {}),
      oflPostWithPhotos: async (p, body, files) => (calls.push(["photos", p, body.hours, files.length]), {}),
    });
    const vm = require("node:vm");
    await ctx.api("/time-entries", { method: "POST", body: { hours: 8 } });
    vm.runInContext('dsTimePhotos = [{ filename: "a.jpg", content: "data:" }];', ctx);
    await ctx.api("/time-entries", { method: "POST", body: { hours: 8 } });
    await ctx.api("/time-entries", { method: "POST", body: { hours: 7 } });
    assert.deepEqual(calls, [
      ["api", "/time-entries"],
      ["photos", "/time-entries", 8, 1],
      ["api", "/time-entries"],
    ]);
    assert.equal(
      vm.runInContext('dsTimeThumbs(["/uploads/a.png"])', ctx),
      '<div class="ds-thumbs"><a href="/uploads/a.png" aria-label="Photo 1"><img data-ds-src="/uploads/a.png" alt=""></a></div>',
    );
    // The offline replay uploads the queued photos before it posts the entry
    assert.match(read("offline-sync.js"), /body: \{ \.\.\.item\.body\.body, photoUrls: await oflUploadAll\(item\.body\.uploads\) \}/);
    assert.match(read("design-screens.css"), /\.ds-photo-grid \{\n  display: grid;\n  grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
    const de = read("i18n.js");
    for (const k of ['Photos: "Fotos"', '"Add photo": "Foto hinzufügen"', '"Attach up to 6 photos"']) assert.ok(de.includes(k), k);
  });

  it("shows the arrival time of site visits on Today, the week and the access lists (T107)", () => {
    const src = read("areas/dashboards.js"),
      cm = read("compliance-ui.js"),
      de = read("i18n.js");
    assert.ok(src.includes('sub: [v.siteName, v.startTime, v.permitLabel].filter(Boolean).join(" · ")'));
    assert.ok(src.includes('visit.status === "Checked in" ? t("dash.today.checkedIn") : visit.startTime || t("dash.today.today")'));
    assert.ok(cm.includes('<label>Arrival time (optional)<input name="startTime" type="time"></label>'));
    assert.ok(cm.includes('startTime: f.get("startTime"),'));
    assert.equal(cm.split('${v.startTime ? " · " + cmEsc(v.startTime) : ""}').length, 3, "both access lists");
    assert.ok(de.includes('[/^Site visit · (\\d\\d:\\d\\d)$/, "Baustellenbesuch · $1"]'));
    assert.ok(de.includes('"Arrival time (optional)": "Ankunftszeit (optional)"'));
  });

  it("shows the due date of submitted invoices in the review panel and the list (T108)", () => {
    const src = read("design-screens.js"),
      rv = read("reviews.js");
    assert.ok(src.includes("i.scheduledPayment || i.dueDate ? `Due ${dsShortRange(i.scheduledPayment || i.dueDate)}`"));
    assert.ok(rv.includes('${rvDue(i) ? `<small>Due ${date(rvDue(i))}</small>` : ""}'));
    assert.match(rv, /if \(i\.status === "Submitted" && i\.dueDate && i\.dueDate < dsToday\(\)\)/);
    assert.ok(read("i18n.js").includes('[/^Due (\\d.+)$/, "Fällig $1"]'));
  });

  it("shows the unread messages of the project on the Messages tab (T109)", async () => {
    const calls = [],
      btn = { label: "Messages", replaceChildren(t) { this.label = t; } };
    const ctx = loadScreens(
      {
        api: async (p) => (calls.push(p), { counts: { projectMessages: 3 } }),
        document: { addEventListener() {}, getElementById: () => null, querySelector: () => null, contains: () => true },
      },
      ["dsWsUnread"],
    );
    await ctx.dsWsUnread(btn, "prj 1");
    assert.deepEqual(calls, ["/nav-counts?project=prj%201"]);
    assert.equal(btn.label, "Messages · 3");
    const quiet = loadScreens({ api: async () => ({ counts: { projectMessages: 0 } }) }, ["dsWsUnread"]);
    const b2 = { label: "Messages", replaceChildren(t) { this.label = t; } };
    await quiet.dsWsUnread(b2, "p");
    assert.equal(b2.label, "Messages");
    assert.ok(read("i18n.js").includes('[/^Messages · (\\d+)$/, "Nachrichten · $1"]'));
    // The project's Messages button opens that project's conversation
    assert.ok(read("collaboration.js").includes('(q.get("project") && chats.find((c) => c.projectId === q.get("project")))'));
  });

  it("opens the Share dialog from a grey pill in the workspace header (T110)", () => {
    const src = read("design-screens.js"),
      de = read("i18n.js");
    assert.ok(src.includes('share.className = "btn outline ds-share";'));
    assert.ok(src.includes("share.onclick = () => dsShare(r.pid);"));
    assert.ok(src.includes('if (r.role === "customer") {'), "customers only");
    for (const call of ["api(`/projects/${encodeURIComponent(pid)}/participants`", 'method: "DELETE"'])
      assert.ok(src.includes(call), call);
    for (const k of ['Share: "Teilen"', '"Share project": "Projekt teilen"', '"People with access"', '"This project": "Dieses Projekt"'])
      assert.ok(de.includes(k), k);
  });

  it("explains the GDPR self-service on the privacy page and lists pending deletions for admins (T123)", () => {
    // The privacy page itself moved to the public area (T126a, test/area-public.test.js)
    const src = read("gdpr-ui.js"),
      de = read("i18n.js"),
      en = read("locales/en.js");
    for (const t of ["deleted after 14 days", "kept for 10 years (§ 147 AO, § 14b UStG)", "Download my data"]) assert.ok(en.includes(t), t);
    assert.ok(src.includes("const gdBaseAdminUsers = adminUsers;"));
    for (const k of ['"Pending account deletions": "Anstehende Kontolöschungen"', '"Deleted user": "Gelöschter Nutzer"'])
      assert.ok(de.includes(k), k);
    // Loaded after the files whose pages it extends, before the design layer and the translation
    const order = [...index.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    for (const f of ["legal-security.js", "collaboration.js", "calendar-ui.js"]) assert.ok(order.indexOf(f) < order.indexOf("gdpr-ui.js"), f);
    assert.ok(order.indexOf("gdpr-ui.js") < order.indexOf("design-screens.js"));
  });

  it("uses a new service worker cache so installed apps load the new files", () => {
    assert.match(read("sw.js"), /const CACHE = "craftcrew-shell-v2"/);
  });
});
