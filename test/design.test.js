// Design 2026 (T90–T105): static checks that the design layers are wired up correctly.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const PUBLIC = path.join(__dirname, "..", "public");
const read = (f) => readFileSync(path.join(PUBLIC, f), "utf8");
const index = read("index.html");

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
    const vm = require("node:vm");
    const stub = { addEventListener() {}, getElementById: () => null };
    const ctx = {
      NG_GROUPS: {},
      ngGroup() {},
      document: stub,
      MutationObserver: class {
        observe() {}
        disconnect() {}
      },
      requestAnimationFrame() {},
      Date,
    };
    vm.runInNewContext(read("design-screens.js") + ";this.dsTone=dsTone;this.dsDaysLate=dsDaysLate;", ctx);
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
    const day = 86400000;
    const ago = (n) => new Date(Date.now() - n * day - 3600000).toISOString().slice(0, 10);
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
    const vm = require("node:vm");
    const NG_GROUPS = { customer: [], supplier: [], admin: [] };
    const ctx = {
      NG_GROUPS,
      ngGroup() {},
      document: { addEventListener() {}, getElementById: () => null },
      MutationObserver: class {
        observe() {}
        disconnect() {}
      },
      requestAnimationFrame() {},
    };
    vm.runInNewContext(
      read("design-screens.js").replace("Object.assign(NG_GROUPS", "Object.assign(this.NG_GROUPS") +
        ";this.labels=DS_SIDE_LABELS;",
      ctx,
    );
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

  it("uses a new service worker cache so installed apps load the new files", () => {
    assert.match(read("sw.js"), /const CACHE = "craftcrew-shell-v2"/);
  });
});
