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

  it("tints status chips by meaning (T92)", () => {
    const ctx = loadScreens({}, ["dsTone"]);
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
    // The days-late text moved to the invoice keys (inv.time.late, T135d)
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

  // T100 (offer cards) moved to the sourcing area: test/area-sourcing.test.js

  // T101 (invoice paper and review panel) moved to the invoices area: test/area-invoices.test.js

  it("gives suppliers a Today screen on phones (T102)", () => {
    const src = read("areas/dashboards.js");
    // The quick actions use the existing forms
    for (const fn of ["ccNewTimeEntry()", "drOpen(j.projectId, j.taskId)", "puOpen(j.projectId, j.taskId)", "cmSupplierVisit("])
      assert.ok(src.includes(fn), `Today uses ${fn}`);
    // Desktop does not change: the Today block only shows up to 640 px
    assert.match(read("design-screens.css"), /html body \.ds-today \{\n  display: none;\n\}\n@media \(max-width: 640px\)/);
  });

  // T103 (Log time sheet) moved to the time area: test/area-time.test.js

  // T104 (approvals) moved to the sites area: test/area-sites.test.js

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

  // T106 (time entry photos) moved to the time area: test/area-time.test.js

  it("shows the arrival time of site visits on Today and the week (T107; the access lists: test/area-sites.test.js)", () => {
    const src = read("areas/dashboards.js");
    assert.ok(src.includes('sub: [v.siteName, v.startTime, v.permitLabel].filter(Boolean).join(" · ")'));
    assert.ok(src.includes('visit.status === "Checked in" ? t("dash.today.checkedIn") : visit.startTime || t("dash.today.today")'));
  });

  // T108 (due dates of invoices) moved to the invoices area: test/area-invoices.test.js

  it("explains the GDPR self-service on the privacy page and lists pending deletions for admins (T123)", () => {
    // The privacy page itself moved to the public area (T126a, test/area-public.test.js)
    const de = read("i18n.js"),
      en = read("locales/en.js");
    for (const t of ["deleted after 14 days", "kept for 10 years (§ 147 AO, § 14b UStG)", "Download my data"]) assert.ok(en.includes(t), t);
    // The pending deletions moved to the admin area (T134a), the self-service panel to the profile area (T135a)
    assert.ok(de.includes('"Deleted user": "Gelöschter Nutzer"'));
  });

  it("uses a new service worker cache so installed apps load the new files", () => {
    assert.match(read("sw.js"), /const CACHE = "craftcrew-shell-v2"/);
  });
});
